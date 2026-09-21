package com.neueda.leap.instrument.repository;

import com.neueda.leap.instrument.dto.InstrumentResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** PostgreSQL-backed read model for instruments. */
@Repository
public class JdbcInstrumentRepository implements InstrumentRepository {
    private static final String SELECT_COLUMNS = """
            SELECT instrument_id, symbol, instrument_name, asset_class,
                   market_code, currency, sector, enabled, tradable
            FROM instruments
            """;

    private static final String LIST_ORDER = " ORDER BY market_code, symbol";

    private final JdbcTemplate jdbcTemplate;
    private final RowMapper<InstrumentResponse> rowMapper = (resultSet, rowNumber) ->
            new InstrumentResponse(
                    resultSet.getObject("instrument_id", UUID.class),
                    resultSet.getString("symbol"),
                    resultSet.getString("instrument_name"),
                    resultSet.getString("asset_class"),
                    resultSet.getString("market_code"),
                    resultSet.getString("currency").trim(),
                    resultSet.getString("sector"),
                    resultSet.getBoolean("enabled"),
                    resultSet.getBoolean("tradable")
            );

    public JdbcInstrumentRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public List<InstrumentResponse> findAll() {
        return jdbcTemplate.query(SELECT_COLUMNS + LIST_ORDER, rowMapper);
    }

    @Override
    public Optional<InstrumentResponse> findById(UUID instrumentId) {
        return jdbcTemplate.query(
                SELECT_COLUMNS + " WHERE instrument_id = ?",
                rowMapper,
                instrumentId
        ).stream().findFirst();
    }
}
