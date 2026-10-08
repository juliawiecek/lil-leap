package com.neueda.leap.order.settlement;

import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Detects and repairs settlements of a fill that were only partly applied (TS-10.3, BR-09).
 * A settlement is identified by its fill. The fill is the permanent trade record, so recovery rebuilds
 * any missing ledger, projection, status or audit row from it; the cash balance only ever moves together
 * with the cash ledger row that explains it. Rollback is limited to settlements that have not yet
 * changed any balance. Every action is audited separately from the settlement it corrects.
 */
@Service
public class SettlementRecoveryService {
    static final String INCOMPLETE = "SETTLEMENT_INCOMPLETE";
    static final String RECOVERED = "SETTLEMENT_RECOVERED";
    static final String ROLLED_BACK = "SETTLEMENT_ROLLED_BACK";
    static final String COMPLETED = "SETTLEMENT_COMPLETED";
    static final String ALREADY_COMPLETE = "ALREADY_COMPLETE";

    private static final String SELECT_SETTLEMENTS = """
            SELECT f.fill_id, f.order_id, o.account_id, o.instrument_id, o.side, f.filled_quantity,
                   f.execution_price, o.status,
                   EXISTS (SELECT 1 FROM holding_movements m WHERE m.fill_id = f.fill_id) AS has_movement,
                   EXISTS (SELECT 1 FROM cash_transactions c WHERE c.fill_id = f.fill_id) AS has_cash,
                   EXISTS (SELECT 1 FROM audit_log a WHERE a.related_order_id = f.order_id
                           AND a.event_type = 'SETTLEMENT_COMPLETED') AS has_completion
            FROM fills f JOIN orders o ON o.order_id = f.order_id
            """;
    private static final String SELECT_INCOMPLETE = SELECT_SETTLEMENTS + """
            WHERE o.status <> 'FILLED'
               OR NOT EXISTS (SELECT 1 FROM holding_movements m WHERE m.fill_id = f.fill_id)
               OR NOT EXISTS (SELECT 1 FROM cash_transactions c WHERE c.fill_id = f.fill_id)
               OR NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.related_order_id = f.order_id
                              AND a.event_type = 'SETTLEMENT_COMPLETED')
            ORDER BY f.filled_at
            """;
    private static final String SELECT_ONE = SELECT_SETTLEMENTS + " WHERE f.fill_id = ?";
    private static final RowMapper<Settlement> SETTLEMENT = (rs, row) -> new Settlement(
            rs.getObject("fill_id", UUID.class), rs.getObject("order_id", UUID.class),
            rs.getObject("account_id", UUID.class), rs.getObject("instrument_id", UUID.class),
            rs.getString("side"), rs.getLong("filled_quantity"), rs.getBigDecimal("execution_price"),
            rs.getString("status"), rs.getBoolean("has_movement"), rs.getBoolean("has_cash"),
            rs.getBoolean("has_completion"));

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;

    /**
     * Creates the service.
     *
     * @param jdbc database access
     * @param manager transaction manager; each action runs in one transaction
     */
    public SettlementRecoveryService(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        this.transactions = new TransactionTemplate(manager);
    }

    /**
     * Finds every incomplete settlement and records each one in the audit log, once until it is recovered.
     *
     * @return identifiers of all settlements that are currently incomplete
     */
    public List<UUID> reportIncomplete() {
        return transactions.execute(status -> {
            List<Settlement> incomplete = jdbc.query(SELECT_INCOMPLETE, SETTLEMENT);
            for (Settlement settlement : incomplete) {
                jdbc.update("""
                        INSERT INTO audit_log(account_id, related_order_id, actor_type, event_type, payload)
                        SELECT ?, ?, 'SYSTEM', ?, CAST(? AS jsonb)
                        WHERE NOT EXISTS (
                            SELECT 1 FROM audit_log a WHERE a.related_order_id = ? AND a.event_type = ?
                              AND a.created_at > COALESCE((SELECT MAX(r.created_at) FROM audit_log r
                                  WHERE r.related_order_id = ? AND r.event_type = ?), TIMESTAMP '1970-01-01 00:00:00'))
                        """, settlement.accountId(), settlement.orderId(), INCOMPLETE,
                        partsPayload(settlement.fillId(), "missing", settlement.missing()),
                        settlement.orderId(), INCOMPLETE, settlement.orderId(), RECOVERED);
            }
            return incomplete.stream().map(Settlement::fillId).toList();
        });
    }

    /**
     * Completes a partly applied settlement by writing only the parts it is missing.
     *
     * @param settlementId the fill whose settlement to complete
     * @return the parts written, or ALREADY_COMPLETE when nothing was missing
     * @throws SettlementException 404 when the fill does not exist, 409 when a repair would break a balance rule
     */
    public SettlementResult recover(UUID settlementId) {
        return transactions.execute(status -> {
            Settlement settlement = lockAndLoad(settlementId);
            List<SettlementPart> missing = settlement.missing();
            String action = missing.isEmpty() ? ALREADY_COMPLETE : "RECOVERED";
            try {
                for (SettlementPart part : missing) {
                    apply(settlement, part);
                }
            } catch (DataAccessException failure) {
                throw new SettlementException(HttpStatus.CONFLICT, "RECOVERY_FAILED",
                        "The settlement cannot be completed without breaking a balance rule.", failure);
            }
            audit(settlement, RECOVERED, partsPayload(settlementId, "repaired", missing));
            return new SettlementResult(settlementId, action, missing);
        });
    }

    /**
     * Rolls back a settlement that has not changed any balance: removes the fill and rejects its order.
     *
     * @param settlementId the fill whose settlement to roll back
     * @return the ROLLED_BACK result
     * @throws SettlementException 404 when the fill does not exist, 409 when balances already changed
     */
    public SettlementResult rollback(UUID settlementId) {
        return transactions.execute(status -> {
            Settlement settlement = lockAndLoad(settlementId);
            if (settlement.hasMovement() || settlement.hasCash()) {
                throw new SettlementException(HttpStatus.CONFLICT, "SETTLEMENT_APPLIED",
                        "This settlement already changed balances; recover it instead of rolling it back.");
            }
            jdbc.update("DELETE FROM fills WHERE fill_id = ?", settlementId);
            jdbc.update("""
                    UPDATE orders SET status = 'REJECTED', last_execution_error = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE order_id = ?
                    """, ROLLED_BACK, settlement.orderId());
            jdbc.update("INSERT INTO order_status_history(order_id, status, reason_code) VALUES (?, 'REJECTED', ?)",
                    settlement.orderId(), ROLLED_BACK);
            audit(settlement, ROLLED_BACK, tradePayload(settlement) + "}");
            return new SettlementResult(settlementId, "ROLLED_BACK", List.of());
        });
    }

    /** Serializes with execution, which locks the account row before settling. */
    private Settlement lockAndLoad(UUID settlementId) {
        List<UUID> account = jdbc.queryForList("""
                SELECT o.account_id FROM fills f JOIN orders o ON o.order_id = f.order_id WHERE f.fill_id = ?
                """, UUID.class, settlementId);
        if (account.isEmpty()) {
            throw new SettlementException(HttpStatus.NOT_FOUND, "SETTLEMENT_NOT_FOUND", "No fill exists with this settlementId.");
        }
        jdbc.queryForList("SELECT account_id FROM accounts WHERE account_id = ? FOR UPDATE", UUID.class, account.get(0));
        return jdbc.queryForObject(SELECT_ONE, SETTLEMENT, settlementId);
    }

    /** Writes one missing part; the switch expression must cover every part, so none can be skipped. */
    private int apply(Settlement settlement, SettlementPart part) {
        return switch (part) {
            case HOLDING_MOVEMENT -> jdbc.update("""
                    INSERT INTO holding_movements(account_id, instrument_id, fill_id, quantity_change, cost_basis, movement_type)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, settlement.accountId(), settlement.instrumentId(), settlement.fillId(),
                    settlement.buy() ? settlement.quantity() : -settlement.quantity(), settlement.price(), settlement.side());
            case CASH_TRANSACTION -> applyCash(settlement);
            case ORDER_STATUS -> markFilled(settlement);
            case COMPLETION_AUDIT -> audit(settlement, COMPLETED,
                    tradePayload(settlement) + ",\"cashDelta\":" + settlement.cashDelta().toPlainString() + "}");
        };
    }

    private int applyCash(Settlement settlement) {
        BigDecimal delta = settlement.cashDelta();
        int written = jdbc.update("""
                INSERT INTO cash_transactions(account_id, fill_id, transaction_type, amount, currency, settlement_status, settled_at)
                VALUES (?, ?, ?, ?, 'USD', 'SETTLED', CURRENT_TIMESTAMP)
                """, settlement.accountId(), settlement.fillId(), settlement.side(), delta);
        int updated = jdbc.update("""
                UPDATE cash_balances SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = ?
                """, delta, settlement.accountId());
        if (updated == 0) {
            updated = jdbc.update("INSERT INTO cash_balances(account_id, currency, balance) VALUES (?, 'USD', ?)",
                    settlement.accountId(), delta);
        }
        return written + updated;
    }

    private int markFilled(Settlement settlement) {
        return jdbc.update("""
                UPDATE orders SET status = 'FILLED', last_execution_error = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE order_id = ?
                """, settlement.orderId())
                + jdbc.update("INSERT INTO order_status_history(order_id, status, reason_code) VALUES (?, 'FILLED', ?)",
                        settlement.orderId(), RECOVERED);
    }

    private int audit(Settlement settlement, String event, String payload) {
        return jdbc.update("""
                INSERT INTO audit_log(account_id, related_order_id, actor_type, event_type, payload)
                VALUES (?, ?, 'SYSTEM', ?, CAST(? AS jsonb))
                """, settlement.accountId(), settlement.orderId(), event, payload);
    }

    // Payload values are identifiers, numbers and enum names only, so no JSON escaping is needed.

    private static String fillPayload(UUID settlementId) {
        return "{\"fillId\":\"" + settlementId + "\"";
    }

    /** Same fields execution records for the fill; left open so callers can append fields. */
    private static String tradePayload(Settlement settlement) {
        return fillPayload(settlement.fillId()) + ",\"quantity\":" + settlement.quantity()
                + ",\"executionPrice\":" + settlement.price().toPlainString();
    }

    private static String partsPayload(UUID settlementId, String field, List<SettlementPart> parts) {
        String names = parts.stream().map(part -> "\"" + part.name() + "\"").collect(Collectors.joining(","));
        return fillPayload(settlementId) + ",\"" + field + "\":[" + names + "]}";
    }

    /** One fill with what its settlement currently has. */
    record Settlement(UUID fillId, UUID orderId, UUID accountId, UUID instrumentId, String side, long quantity,
                      BigDecimal price, String orderStatus, boolean hasMovement, boolean hasCash,
                      boolean hasCompletion) {
        boolean buy() {
            return "BUY".equals(side);
        }

        /** Same rounding and sign as execution: buys pay, sells receive, rounded to cents. */
        BigDecimal cashDelta() {
            BigDecimal amount = price.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP);
            return buy() ? amount.negate() : amount;
        }

        List<SettlementPart> missing() {
            List<SettlementPart> missing = new ArrayList<>();
            if (!hasMovement) {
                missing.add(SettlementPart.HOLDING_MOVEMENT);
            }
            if (!hasCash) {
                missing.add(SettlementPart.CASH_TRANSACTION);
            }
            if (!"FILLED".equals(orderStatus)) {
                missing.add(SettlementPart.ORDER_STATUS);
            }
            if (!hasCompletion) {
                missing.add(SettlementPart.COMPLETION_AUDIT);
            }
            return missing;
        }
    }
}
