package com.neueda.leap.portfolio.service;

import com.neueda.leap.portfolio.dto.HoldingResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;
import java.util.UUID;

/**
 * Reads holdings for the authenticated client only.
 *
 * <p>Every query derives ownership by joining through accounts.user_id. The
 * caller never supplies a user id parameter, so cross-client access is
 * prevented at the database level: if the requested account does not belong
 * to the authenticated user, no row is returned.</p>
 *
 * <p>TS-11.1c: Single-holding lookup (GET /holdings/{accountId}/{instrumentId})
 * reuses this service to filter holdings to one ID.</p>
 */
@Service
@Transactional(readOnly = true)
public class ClientPortfolioQueryService {

    private static final String SINGLE_HOLDING_SQL = """
            SELECT h.account_id, h.instrument_id, i.symbol, i.instrument_name,
                   h.quantity, h.avg_cost, h.updated_at
            FROM holdings h
            JOIN accounts a ON a.account_id = h.account_id
            JOIN instruments i ON i.instrument_id = h.instrument_id
            WHERE a.user_id = ? AND h.account_id = ? AND h.instrument_id = ?
            """;

    private final JdbcTemplate jdbcTemplate;

    /**
     * Creates the client-scoped query service.
     *
     * @param jdbcTemplate database access for account ownership joins
     */
    public ClientPortfolioQueryService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Fetches a single holding by account and instrument, scoped to the authenticated caller.
     *
     * <p>TS-11.1c AC1: Returns detail for one holding, scoped to the authenticated caller.
     * TS-11.1c AC2: Requesting another client's holding ID returns empty Optional.</p>
     *
     * @param userId authenticated caller's user ID
     * @param accountId account containing the holding
     * @param instrumentId instrument being held
     * @return the holding detail if it exists and belongs to the caller, otherwise empty
     */
    public Optional<HoldingResponse> getHoldingByIdScoped(UUID userId, UUID accountId, UUID instrumentId) {
        return jdbcTemplate.query(
                SINGLE_HOLDING_SQL,
                new HoldingRowMapper(),
                userId,
                accountId,
                instrumentId
        ).stream().findFirst();
    }

    /**
     * Maps a holdings row to a HoldingResponse.
     */
    private static final class HoldingRowMapper implements RowMapper<HoldingResponse> {
        @Override
        public HoldingResponse mapRow(ResultSet rs, int rowNum) throws SQLException {
            return new HoldingResponse(
                    java.util.UUID.fromString(rs.getString("account_id")),
                    java.util.UUID.fromString(rs.getString("instrument_id")),
                    rs.getString("symbol"),
                    rs.getString("instrument_name"),
                    rs.getLong("quantity"),
                    rs.getBigDecimal("avg_cost"),
                    rs.getTimestamp("updated_at").toInstant()
            );
        }
    }
}
