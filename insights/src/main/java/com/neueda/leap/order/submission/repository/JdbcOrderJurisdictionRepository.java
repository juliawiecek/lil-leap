package com.neueda.leap.order.submission.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/** Reads current restriction rules on each new submission; no stale application cache. */
@Repository
public class JdbcOrderJurisdictionRepository implements OrderJurisdictionRepository {
    private final JdbcTemplate jdbc;

    /**
     * Creates jurisdiction queries participating in the submission transaction.
     * @param jdbc JDBC operations
     */
    public JdbcOrderJurisdictionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<String> registeredCountry(UUID userId) {
        return jdbc.query("SELECT country FROM customer_profiles WHERE user_id = ? AND country IS NOT NULL",
                (rs, row) -> rs.getString("country"), userId).stream().findFirst();
    }

    @Override
    public boolean isRestricted(UUID instrumentId, String countryCode) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM instrument_jurisdiction_restrictions
                WHERE instrument_id = ? AND country_code = ? AND enabled = TRUE
                """, Integer.class, instrumentId, countryCode);
        return count != null && count > 0;
    }
}
