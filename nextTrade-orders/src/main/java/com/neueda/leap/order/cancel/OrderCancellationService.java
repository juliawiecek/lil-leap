package com.neueda.leap.order.cancel;

import com.neueda.leap.order.query.OrderNotFoundException;
import com.neueda.leap.order.query.OrderStatusResponse;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Cancels a caller's order while it is still waiting to execute (PS-14). The order row is locked
 * without waiting: if the execution worker holds it, the order is executing and the cancel is
 * refused, so a cancel and a fill can never both happen. A cancelled order is never claimed
 * again, because the worker only executes PENDING orders. No cash or holdings change.
 */
@Service
public class OrderCancellationService {
    /** Statuses in which an order has not started executing. */
    static final Set<String> CANCELLABLE = Set.of("SUBMITTED", "ACCEPTED", "PENDING", "DELAYED");
    static final String CANCELLED = "CANCELLED";
    static final String REASON = "CANCELLED_BY_CLIENT";
    /** PostgreSQL's "lock_not_available": NOWAIT found the row locked by another transaction. */
    private static final String LOCK_NOT_AVAILABLE = "55P03";

    private static final String LOCK_OWNED_ORDER_SQL = """
            SELECT status, account_id FROM orders
            WHERE order_id = ? AND account_id IN (SELECT account_id FROM accounts WHERE user_id = ?)
            FOR UPDATE NOWAIT
            """;

    private final JdbcTemplate jdbc;

    /**
     * Creates the service.
     * @param jdbc transactional database access
     */
    public OrderCancellationService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Cancels the order if it belongs to the caller and is still waiting to execute.
     * @param orderId order to cancel
     * @param userId authenticated caller
     * @return the order's new status
     * @throws OrderNotFoundException if the order does not exist or belongs to someone else
     * @throws OrderCancellationException if it is executing or has already finished
     */
    @Transactional
    public OrderStatusResponse cancel(UUID orderId, UUID userId) {
        List<LockedOrder> rows;
        try {
            rows = jdbc.query(LOCK_OWNED_ORDER_SQL,
                    (rs, n) -> new LockedOrder(rs.getString("status"), rs.getObject("account_id", UUID.class)),
                    orderId, userId);
        } catch (DataAccessException failure) {
            if (isLockedByAnotherTransaction(failure)) {
                throw new OrderCancellationException(OrderCancellationException.Reason.ORDER_EXECUTING);
            }
            throw failure;
        }
        LockedOrder order = rows.stream().findFirst().orElseThrow(OrderNotFoundException::new);
        if (!CANCELLABLE.contains(order.status())) {
            throw new OrderCancellationException(OrderCancellationException.Reason.ORDER_NOT_CANCELLABLE);
        }

        jdbc.update("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?", CANCELLED, orderId);
        jdbc.update("INSERT INTO order_status_history(order_id, status, reason_code) VALUES (?, ?, ?)",
                orderId, CANCELLED, REASON);
        jdbc.update("""
                INSERT INTO audit_log(account_id, related_order_id, actor_type, event_type, payload)
                VALUES (?, ?, 'USER', 'ORDER_CANCELLED',
                        jsonb_build_object('previousStatus', CAST(? AS text), 'cancelledBy', CAST(? AS text)))
                """, order.accountId(), orderId, order.status(), userId.toString());
        return new OrderStatusResponse(orderId, CANCELLED, REASON, null, Instant.now());
    }

    /** True when the row lock was refused because the execution worker holds the order. */
    static boolean isLockedByAnotherTransaction(DataAccessException failure) {
        if (failure instanceof PessimisticLockingFailureException) {
            return true;
        }
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && LOCK_NOT_AVAILABLE.equals(sql.getSQLState())) {
                return true;
            }
        }
        return false;
    }

    private record LockedOrder(String status, UUID accountId) {}
}
