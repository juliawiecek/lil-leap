package com.neueda.leap.portfolio.settlement;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for detecting settlement integrity mismatches (TS-10.3, BR-09, AC1).
 * Compares ledger (source of truth) vs cache and identifies discrepancies.
 */
@Repository
public class SettlementIntegrityRepository {
    private final JdbcTemplate jdbc;

    /**
     * Creates a SettlementIntegrityRepository with the supplied dependencies.
     * @param jdbc JDBC operations participating in Spring transactions
     */
    public SettlementIntegrityRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Record for holding mismatch details.
     *
     * @param accountId account whose holding disagrees
     * @param instrumentId instrument whose holding disagrees
     * @param cachedQuantity quantity in the holdings cache
     * @param ledgerQuantity quantity recomputed from holding movements
     * @param cachedAvgCost average cost in the holdings cache
     * @param ledgerAvgCost average cost recomputed from holding movements
     */
    public record HoldingMismatch(
            UUID accountId,
            UUID instrumentId,
            Long cachedQuantity,
            Long ledgerQuantity,
            BigDecimal cachedAvgCost,
            BigDecimal ledgerAvgCost
    ) {}

    /**
     * Record for cash balance mismatch details.
     *
     * @param accountId account whose balance disagrees
     * @param cachedBalance balance in the cash balance cache
     * @param ledgerBalance balance recomputed from cash transactions
     */
    public record CashMismatch(
            UUID accountId,
            BigDecimal cachedBalance,
            BigDecimal ledgerBalance
    ) {}

    /**
     * Detects partially applied settlements by comparing cache vs ledger (AC1).
     * Returns true if any mismatch exists (holdings or cash).
     *
     * @param accountId account to check
     * @return true if cache and ledger diverge
     */
    public boolean hasIncompleteSettlement(UUID accountId) {
        return !getHoldingMismatches(accountId).isEmpty() ||
               getCashMismatch(accountId).isPresent();
    }

    /**
     * Retrieves all holding mismatches for an account (ledger vs cache).
     * @param accountId account to audit
     * @return map of (instrument_id -> mismatch details)
     */
    public Map<UUID, HoldingMismatch> getHoldingMismatches(UUID accountId) {
        Map<UUID, HoldingMismatch> mismatches = new HashMap<>();

        // Compare ledger-computed holdings vs cached holdings
        String query = """
            SELECT 
                COALESCE(hm.account_id, h.account_id) as account_id,
                COALESCE(hm.instrument_id, h.instrument_id) as instrument_id,
                COALESCE(h.quantity, 0) as cached_quantity,
                COALESCE(hm.ledger_quantity, 0) as ledger_quantity,
                COALESCE(h.avg_cost, 0) as cached_avg_cost,
                COALESCE(hm.ledger_avg_cost, 0) as ledger_avg_cost
            FROM holdings h
            FULL OUTER JOIN (
                SELECT 
                    account_id,
                    instrument_id,
                    SUM(quantity_change) as ledger_quantity,
                    CASE
                        WHEN SUM(quantity_change) = 0 THEN 0
                        ELSE ROUND(SUM(quantity_change * cost_basis) / SUM(quantity_change)::NUMERIC, 8)
                    END as ledger_avg_cost
                FROM holding_movements
                WHERE account_id = ?
                GROUP BY account_id, instrument_id
                HAVING SUM(quantity_change) > 0
            ) hm ON h.account_id = hm.account_id AND h.instrument_id = hm.instrument_id
            WHERE COALESCE(h.account_id, hm.account_id) = ?
              AND (h.quantity IS DISTINCT FROM COALESCE(hm.ledger_quantity, 0)
                   OR h.avg_cost IS DISTINCT FROM COALESCE(hm.ledger_avg_cost, 0))
            """;

        jdbc.query(query, (rs, row) -> {
            UUID instrumentId = rs.getObject("instrument_id", UUID.class);
            HoldingMismatch mismatch = new HoldingMismatch(
                    rs.getObject("account_id", UUID.class),
                    instrumentId,
                    rs.getLong("cached_quantity"),
                    rs.getLong("ledger_quantity"),
                    rs.getBigDecimal("cached_avg_cost"),
                    rs.getBigDecimal("ledger_avg_cost")
            );
            mismatches.put(instrumentId, mismatch);
            return null;
        }, accountId, accountId);

        return mismatches;
    }

    /**
     * Retrieves cash balance mismatch for an account (ledger vs cache).
     * @param accountId account to audit
     * @return mismatch details if divergence exists
     */
    public Optional<CashMismatch> getCashMismatch(UUID accountId) {
        String query = """
            SELECT 
                ? as account_id,
                COALESCE(cb.balance, 0) as cached_balance,
                COALESCE(SUM(ct.amount), 0) as ledger_balance
            FROM cash_balances cb
            FULL OUTER JOIN cash_transactions ct ON cb.account_id = ct.account_id
            WHERE COALESCE(cb.account_id, ct.account_id) = ?
            GROUP BY cb.balance
            HAVING COALESCE(cb.balance, 0) IS DISTINCT FROM COALESCE(SUM(ct.amount), 0)
            """;

        return jdbc.query(query, (rs, row) -> new CashMismatch(
                rs.getObject("account_id", UUID.class),
                rs.getBigDecimal("cached_balance"),
                rs.getBigDecimal("ledger_balance")
        ), accountId, accountId).stream().findFirst();
    }

    /**
     * Counts settlement movements (holding_movements + cash_transactions) for an account.
     * Used to detect whether any settlements exist.
     *
     * @param accountId account to check
     * @return total number of movements
     */
    public long getSettlementMovementCount(UUID accountId) {
        Long holdingMovements = jdbc.queryForObject(
                "SELECT COUNT(*) FROM holding_movements WHERE account_id = ?",
                Long.class, accountId);
        Long cashTransactions = jdbc.queryForObject(
                "SELECT COUNT(*) FROM cash_transactions WHERE account_id = ?",
                Long.class, accountId);

        return (holdingMovements != null ? holdingMovements : 0) +
               (cashTransactions != null ? cashTransactions : 0);
    }
}
