package com.neueda.leap.order.submission.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.UUID;

/** Reads the same cash and holdings caches exposed by the portfolio API. */
@Repository
public class JdbcOrderSufficiencyRepository implements OrderSufficiencyRepository {
    private final JdbcTemplate jdbc;

    /**
     * Creates balance queries participating in the submission transaction.
     * @param jdbc JDBC operations
     */
    public JdbcOrderSufficiencyRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public BigDecimal cashBalance(UUID accountId) {
        return jdbc.query("SELECT balance FROM cash_balances WHERE account_id = ? AND currency = 'USD'",
                (rs, row) -> rs.getBigDecimal("balance"), accountId)
                .stream().findFirst().orElse(BigDecimal.ZERO);
    }

    @Override
    public BigDecimal executionBufferPercent(UUID accountId) {
        return jdbc.queryForObject("SELECT execution_buffer_percent FROM accounts WHERE account_id = ?",
                BigDecimal.class, accountId);
    }

    @Override
    public long holdingQuantity(UUID accountId, UUID instrumentId) {
        return jdbc.query("SELECT quantity FROM holdings WHERE account_id = ? AND instrument_id = ?",
                (rs, row) -> rs.getLong("quantity"), accountId, instrumentId)
                .stream().findFirst().orElse(0L);
    }
}
