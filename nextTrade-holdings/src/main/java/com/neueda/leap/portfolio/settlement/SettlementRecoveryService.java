package com.neueda.leap.portfolio.settlement;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Service for settlement recovery and rollback (TS-10.3, BR-09).
 * Implements "ledger wins" rule: when cache and ledger diverge, recompute cache from ledger.
 * Detects and corrects partial settlements left by failures.
 */
@Service
public class SettlementRecoveryService {
    private final SettlementIntegrityRepository integrity;
    private final JdbcTemplate jdbc;

    /**
     * Creates a SettlementRecoveryService with the supplied dependencies.
     * @param integrity integrity checking repository
     * @param jdbc JDBC operations for recovery work
     */
    public SettlementRecoveryService(SettlementIntegrityRepository integrity, JdbcTemplate jdbc) {
        this.integrity = integrity;
        this.jdbc = jdbc;
    }

    /**
     * Record for recovery result details.
     */
    public record RecoveryResult(
            UUID accountId,
            String status,  // "CONSISTENT", "RECOVERED", "FAILED"
            int holdingsReconciled,
            int cashReconciled,
            String details
    ) {}

    /**
     * Detects and recovers from partially applied settlements (AC1, AC2).
     * Reads from ledger (holding_movements, cash_transactions), recomputes cache
     * (holdings, cash_balances) if they diverge. Implements "ledger wins" rule.
     * Idempotent: can be called multiple times safely.
     *
     * @param accountId account to recover
     * @return recovery result indicating changes made
     */
    @Transactional
    public RecoveryResult recover(UUID accountId) {
        // Check for mismatches
        var holdingMismatches = integrity.getHoldingMismatches(accountId);
        var cashMismatch = integrity.getCashMismatch(accountId);

        if (holdingMismatches.isEmpty() && cashMismatch.isEmpty()) {
            return new RecoveryResult(accountId, "CONSISTENT", 0, 0, "No settlement mismatches detected");
        }

        List<String> actions = new ArrayList<>();
        int holdingsReconciled = 0;
        int cashReconciled = 0;

        // Apply "ledger wins" rule to holdings
        for (var mismatch : holdingMismatches.values()) {
            if (mismatch.ledgerQuantity() != mismatch.cachedQuantity() ||
                (mismatch.ledgerAvgCost() != null &&
                 mismatch.cachedAvgCost() != null &&
                 !mismatch.ledgerAvgCost().equals(mismatch.cachedAvgCost()))) {

                // Update cache to match ledger
                jdbc.update("""
                    INSERT INTO holdings(account_id, instrument_id, quantity, avg_cost, updated_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT (account_id, instrument_id)
                    DO UPDATE SET quantity = ?, avg_cost = ?, updated_at = CURRENT_TIMESTAMP
                    """,
                    accountId, mismatch.instrumentId(), mismatch.ledgerQuantity(), mismatch.ledgerAvgCost(),
                    mismatch.ledgerQuantity(), mismatch.ledgerAvgCost());

                holdingsReconciled++;
                actions.add(String.format("Holdings [%s]: qty %d→%d, cost %.8f→%.8f",
                        mismatch.instrumentId().toString().substring(0, 8),
                        mismatch.cachedQuantity(), mismatch.ledgerQuantity(),
                        mismatch.cachedAvgCost(), mismatch.ledgerAvgCost()));
            }
        }

        // Apply "ledger wins" rule to cash balance
        if (cashMismatch.isPresent()) {
            var mismatch = cashMismatch.get();
            if (!mismatch.cachedBalance().equals(mismatch.ledgerBalance())) {
                // Update cache to match ledger
                jdbc.update("""
                    INSERT INTO cash_balances(account_id, currency, balance, updated_at)
                    VALUES (?, 'USD', ?, CURRENT_TIMESTAMP)
                    ON CONFLICT (account_id)
                    DO UPDATE SET balance = ?, updated_at = CURRENT_TIMESTAMP
                    """,
                    accountId, mismatch.ledgerBalance(), mismatch.ledgerBalance());

                cashReconciled = 1;
                actions.add(String.format("Cash balance: %.2f→%.2f",
                        mismatch.cachedBalance(), mismatch.ledgerBalance()));
            }
        }

        String details = actions.isEmpty() ?
                "No reconciliation actions needed" :
                String.join("; ", actions);

        return new RecoveryResult(accountId, "RECOVERED", holdingsReconciled, cashReconciled, details);
    }

    /**
     * Rolls back a settlement by removing its cache entries (holdings, cash_balances).
     * The ledger (holding_movements, cash_transactions) remains as an audit trail.
     * Primarily useful for testing or correcting erroneous settlements.
     *
     * @param accountId account to rollback
     * @return recovery result indicating changes made
     */
    @Transactional
    public RecoveryResult rollback(UUID accountId) {
        // Delete all holdings for this account (ledger remains)
        int holdingsDeleted = jdbc.update("DELETE FROM holdings WHERE account_id = ?", accountId);

        // Delete all cash balance for this account (ledger remains)
        int balanceDeleted = jdbc.update("DELETE FROM cash_balances WHERE account_id = ?", accountId);

        String details = String.format("Rolled back %d holdings, %d cash balance entries. Ledger audit trail preserved.",
                holdingsDeleted, balanceDeleted);

        return new RecoveryResult(accountId, "RECOVERED", holdingsDeleted, balanceDeleted, details);
    }
}
