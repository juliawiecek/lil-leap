package com.neueda.leap.order.execution;

import com.neueda.leap.order.execution.quote.ExecutionQuoteDecision;
import com.neueda.leap.order.execution.quote.ExecutionQuoteService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

/** Fills or rejects a locked order; settlement participates in the worker transaction. */
@Service
public class JdbcOrderExecutor implements OrderExecutor {
    private final JdbcTemplate jdbc;
    private final ExecutionQuoteService quotes;
    private final long maxAttempts;

    /**
     * Creates the execution handler.
     * @param jdbc transactional database access
     * @param quotes latest quote and freshness contract
     * @param maxAttempts maximum attempts for out-of-tolerance prices
     */
    public JdbcOrderExecutor(JdbcTemplate jdbc, ExecutionQuoteService quotes,
            @Value("${orders.execution.max-price-attempts:10}") long maxAttempts) {
        if (maxAttempts < 1) throw new IllegalArgumentException("Attempt limit must be positive");
        this.jdbc = jdbc;
        this.quotes = quotes;
        this.maxAttempts = maxAttempts;
    }

    /** Refuses startup when the required transactional holdings projection is absent. */
    @jakarta.annotation.PostConstruct
    public void requireHoldingsProjection() {
        Boolean ready = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = to_regclass('holding_movements')
                    AND tgname = 'tg_holding_movement_projection'
                    AND tgenabled IN ('O', 'A'))
                """, Boolean.class);
        if (!Boolean.TRUE.equals(ready)) {
            throw new IllegalStateException("Apply db/migrations/008_holdings_projection.sql before starting Orders");
        }
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Outcome execute(UUID orderId) {
        var order = jdbc.queryForObject("""
                SELECT account_id, instrument_id, side, quantity, execution_attempts, buffer_percent
                FROM orders WHERE order_id = ?
                """, (rs, n) -> new Trade(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
                rs.getString(3), rs.getLong(4), rs.getLong(5), rs.getBigDecimal(6)), orderId);
        if (order == null) throw new IllegalArgumentException("Order not found");

        // Serialize all settlements for an account, including initially absent balance rows.
        var account = jdbc.queryForObject("""
                SELECT account_status, trading_enabled, execution_buffer_percent, min_balance_requirement
                FROM accounts WHERE account_id = ? FOR UPDATE
                """, (rs, n) -> new Account(rs.getString(1), rs.getBoolean(2), rs.getBigDecimal(3), rs.getBigDecimal(4)), order.account());
        if (account == null || !"ACTIVE".equals(account.status()) || !account.enabled())
            return reject(orderId, "ACCOUNT_NOT_ACTIVE");
        Boolean tradable = jdbc.queryForObject(
                "SELECT enabled AND tradable FROM instruments WHERE instrument_id = ?",
                Boolean.class, order.instrument());
        if (!Boolean.TRUE.equals(tradable)) return reject(orderId, "INSTRUMENT_NOT_TRADABLE");

        var decision = quotes.selectForExecution(orderId);
        if (decision.action() == ExecutionQuoteDecision.Action.REQUEUE) return Outcome.PENDING;
        if (decision.action() == ExecutionQuoteDecision.Action.REJECT)
            return reject(orderId, decision.reason().name());
        var quote = decision.quote();
        boolean buy = "BUY".equals(order.side());
        BigDecimal price = buy ? quote.ask() : quote.bid();
        BigDecimal buffer = (order.buffer() == null ? account.buffer() : order.buffer()).movePointLeft(2);
        BigDecimal limit = quote.midpoint().multiply(buy ? BigDecimal.ONE.add(buffer) : BigDecimal.ONE.subtract(buffer));
        if (buy ? price.compareTo(limit) > 0 : price.compareTo(limit) < 0)
            return order.attempts() >= maxAttempts ? reject(orderId, "PRICE_OUT_OF_TOLERANCE") : Outcome.PENDING;

        BigDecimal cash = jdbc.query("SELECT balance FROM cash_balances WHERE account_id = ? FOR UPDATE",
                (rs, n) -> rs.getBigDecimal(1), order.account()).stream().findFirst().orElse(BigDecimal.ZERO);
        if (cash.compareTo(account.minimum()) < 0) return reject(orderId, "ACCOUNT_NOT_SUITABLE");
        var position = jdbc.query("""
                SELECT quantity, avg_cost FROM holdings WHERE account_id = ? AND instrument_id = ? FOR UPDATE
                """, (rs, n) -> new Position(rs.getLong(1), rs.getBigDecimal(2)), order.account(), order.instrument())
                .stream().findFirst().orElse(new Position(0, BigDecimal.ZERO));
        BigDecimal amount = price.multiply(BigDecimal.valueOf(order.quantity())).setScale(2, RoundingMode.HALF_UP);
        if (buy && cash.compareTo(amount) < 0) return reject(orderId, "INSUFFICIENT_CASH");
        if (!buy && position.quantity() < order.quantity()) return reject(orderId, "INSUFFICIENT_HOLDINGS");

        UUID fill = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO fills(fill_id, order_id, filled_quantity, execution_price, quote_timestamp)
                VALUES (?, ?, ?, ?, ?)
                """, fill, orderId, order.quantity(), price, quote.quotedAt());
        long change = buy ? order.quantity() : -order.quantity();
        jdbc.update("""
                INSERT INTO holding_movements(account_id, instrument_id, fill_id, quantity_change, cost_basis, movement_type)
                VALUES (?, ?, ?, ?, ?, ?)
                """, order.account(), order.instrument(), fill, change, price, order.side());
        BigDecimal cashChange = buy ? amount.negate() : amount;
        jdbc.update("""
                INSERT INTO cash_transactions(account_id, fill_id, transaction_type, amount, currency)
                VALUES (?, ?, ?, ?, 'USD')
                """, order.account(), fill, order.side(), cashChange);

        // holding_movements invokes the transactional holdings projection trigger.
        jdbc.update("""
                INSERT INTO cash_balances(account_id, currency, balance) VALUES (?, 'USD', ?)
                ON CONFLICT (account_id) DO UPDATE SET balance = EXCLUDED.balance, updated_at = CURRENT_TIMESTAMP
                """, order.account(), cash.add(cashChange));
        history(orderId, "FILLED", "EXECUTION_SUCCESS");
        jdbc.update("""
                INSERT INTO audit_log(account_id, related_order_id, actor_type, event_type)
                VALUES (?, ?, 'SYSTEM', 'ORDER_FILLED')
                """, order.account(), orderId);
        return Outcome.FILLED;
    }

    private Outcome reject(UUID orderId, String reason) {
        jdbc.update("UPDATE orders SET status = 'REJECTED', last_execution_error = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?",
                reason, orderId);
        history(orderId, "REJECTED", reason);
        return Outcome.REJECTED;
    }

    private void history(UUID orderId, String status, String reason) {
        jdbc.update("INSERT INTO order_status_history(order_id, status, reason_code) VALUES (?, ?, ?)", orderId, status, reason);
    }

    private record Trade(UUID account, UUID instrument, String side, long quantity, long attempts, BigDecimal buffer) {}
    private record Account(String status, boolean enabled, BigDecimal buffer, BigDecimal minimum) {}
    private record Position(long quantity, BigDecimal cost) {}
}
