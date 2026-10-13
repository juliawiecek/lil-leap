package com.neueda.leap.order.execution.cash;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * PostgreSQL cash movements. {@link Propagation#MANDATORY} makes every method fail when no
 * transaction is active, so a movement can only join an existing settlement and never open
 * or commit one of its own.
 */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class JdbcCashMovementAdapter implements CashMovementAdapter {
    private final JdbcTemplate jdbc;

    /**
     * Creates the adapter.
     * @param jdbc JDBC operations participating in Spring transactions
     */
    public JdbcCashMovementAdapter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public BigDecimal lockBalance(UUID accountId) {
        // The account row lock also covers a balance row that does not exist yet.
        if (jdbc.query("SELECT account_id FROM accounts WHERE account_id = ? FOR UPDATE",
                (rs, n) -> rs.getObject(1), accountId).isEmpty()) {
            throw new IllegalArgumentException("Account not found");
        }
        return jdbc.query("SELECT balance FROM cash_balances WHERE account_id = ? FOR UPDATE",
                (rs, n) -> rs.getBigDecimal(1), accountId).stream().findFirst().orElse(BigDecimal.ZERO);
    }

    @Override
    public BigDecimal buy(UUID accountId, UUID fillId, BigDecimal amount) {
        return move(accountId, fillId, "BUY", requirePositive(amount).negate());
    }

    @Override
    public BigDecimal sell(UUID accountId, UUID fillId, BigDecimal amount) {
        return move(accountId, fillId, "SELL", requirePositive(amount));
    }

    private BigDecimal move(UUID accountId, UUID fillId, String type, BigDecimal change) {
        BigDecimal balance = lockBalance(accountId).add(change);
        if (balance.signum() < 0) throw new IllegalStateException("Cash movement would overdraw the account");
        jdbc.update("""
                INSERT INTO cash_transactions(account_id, fill_id, transaction_type, amount, currency, settlement_status, settled_at)
                VALUES (?, ?, ?, ?, 'USD', 'SETTLED', CURRENT_TIMESTAMP)
                """, accountId, fillId, type, change);
        // The ledger is the source of truth; the balance row is its cache and moves with it.
        if (jdbc.update("UPDATE cash_balances SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = ?",
                balance, accountId) == 0) {
            jdbc.update("INSERT INTO cash_balances(account_id, currency, balance) VALUES (?, 'USD', ?)", accountId, balance);
        }
        return balance;
    }

    private static BigDecimal requirePositive(BigDecimal amount) {
        if (amount == null || amount.signum() <= 0 || amount.stripTrailingZeros().scale() > 2) {
            throw new IllegalArgumentException("Cash amount must be positive with at most two decimal places");
        }
        return amount;
    }
}
