package com.neueda.leap.trades;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TradeLookupTest {

    private static final UUID ORDER = UUID.fromString("f0000000-0000-4000-8000-000000000012");
    private static final UUID ACCOUNT = UUID.fromString("e0000000-0000-4000-8000-000000000001");
    private static final Instant FILLED = Instant.parse("2026-10-05T18:04:36Z");

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final TradeLookup lookup = new TradeLookup(jdbc, new ObjectMapper());

    @Test
    void findsAFilledTradeWithItsValueClientAndSteps() throws SQLException {
        trade(tradeRow("Maya", "Chen"));
        steps(stepRow("STATUS", "SUBMITTED", null, FILLED.minusSeconds(2), "{\"reasonCode\": \"SUBMISSION_VALIDATED\"}"),
                stepRow("AUDIT", "ORDER_FILLED", "SYSTEM", FILLED, "{\"quantity\": 49, \"cashDelta\": \"-2426.73\"}"));

        TradeRecord trade = lookup.find(ORDER).orElseThrow();

        assertThat(trade.orderId()).isEqualTo(ORDER);
        assertThat(trade.filledAt()).isEqualTo(FILLED);
        assertThat(trade.symbol()).isEqualTo("BAC");
        assertThat(trade.side()).isEqualTo("BUY");
        assertThat(trade.quantity()).isEqualTo(49);
        assertThat(trade.price()).isEqualByComparingTo("49.525");
        assertThat(trade.value()).isEqualTo(new BigDecimal("2426.73"));
        assertThat(trade.account()).isEqualTo(new TradeRecord.Account(ACCOUNT, "NT-DEMO-0001", "Maya Chen Individual",
                "Maya Chen", "maya.chen@demo.nexttrade.local", "NOVICE", "ACTIVE"));
        assertThat(trade.events()).containsExactly(
                new TradeRecord.Event("STATUS", "SUBMITTED", null, FILLED.minusSeconds(2),
                        Map.of("reasonCode", "SUBMISSION_VALIDATED")),
                new TradeRecord.Event("AUDIT", "ORDER_FILLED", "SYSTEM", FILLED,
                        Map.of("quantity", 49, "cashDelta", "-2426.73")));
        verify(jdbc).query(contains("v_trade_clients"), any(RowMapper.class), eq(ORDER));
    }

    @Test
    void anOrderWithNoFillIsEmptyAndItsStepsAreNotRead() {
        trade();

        assertThat(lookup.find(ORDER)).isEmpty();
        verify(jdbc, never()).query(contains("order_status_history"), any(RowMapper.class),
                any(), any(), any(), any(), any());
    }

    @Test
    void aTraderWithoutAProfileHasNoName() throws SQLException {
        trade(tradeRow(null, null));
        steps();

        assertThat(lookup.find(ORDER).orElseThrow().account().clientName()).isNull();
    }

    @Test
    void aStepThatIsNotJsonFailsLoudly() throws SQLException {
        trade(tradeRow("Maya", "Chen"));
        steps(stepRow("AUDIT", "ORDER_FILLED", "SYSTEM", FILLED, "not json"));

        assertThatThrownBy(() -> lookup.find(ORDER)).isInstanceOf(IllegalStateException.class);
    }

    @SuppressWarnings("unchecked")
    private void trade(ResultSet... rows) {
        when(jdbc.query(contains("FROM orders o"), any(RowMapper.class), eq(ORDER)))
                .thenAnswer(call -> map(call.getArgument(1, RowMapper.class), rows));
    }

    @SuppressWarnings("unchecked")
    private void steps(ResultSet... rows) {
        when(jdbc.query(contains("order_status_history"), any(RowMapper.class),
                eq(ORDER), eq(ORDER), eq(ORDER), eq(ORDER), eq(ORDER)))
                .thenAnswer(call -> map(call.getArgument(1, RowMapper.class), rows));
    }

    private static List<Object> map(RowMapper<?> mapper, ResultSet... rows) throws SQLException {
        List<Object> mapped = new ArrayList<>();
        for (int i = 0; i < rows.length; i++) {
            mapped.add(mapper.mapRow(rows[i], i));
        }
        return mapped;
    }

    private static ResultSet tradeRow(String firstName, String lastName) throws SQLException {
        ResultSet row = mock(ResultSet.class);
        when(row.getObject("order_id", UUID.class)).thenReturn(ORDER);
        when(row.getObject("filled_at", OffsetDateTime.class)).thenReturn(FILLED.atOffset(ZoneOffset.UTC));
        when(row.getString("symbol")).thenReturn("BAC");
        when(row.getString("instrument_name")).thenReturn("Bank of America, Corp.");
        when(row.getString("side")).thenReturn("BUY");
        when(row.getLong("filled_quantity")).thenReturn(49L);
        when(row.getBigDecimal("execution_price")).thenReturn(new BigDecimal("49.52500000"));
        when(row.getObject("account_id", UUID.class)).thenReturn(ACCOUNT);
        when(row.getString("account_number")).thenReturn("NT-DEMO-0001");
        when(row.getString("account_name")).thenReturn("Maya Chen Individual");
        when(row.getString("trader_level")).thenReturn("NOVICE");
        when(row.getString("account_status")).thenReturn("ACTIVE");
        when(row.getString("first_name")).thenReturn(firstName);
        when(row.getString("last_name")).thenReturn(lastName);
        when(row.getString("email")).thenReturn("maya.chen@demo.nexttrade.local");
        return row;
    }

    private static ResultSet stepRow(String source, String type, String actor, Instant at, String details)
            throws SQLException {
        ResultSet row = mock(ResultSet.class);
        when(row.getString("source")).thenReturn(source);
        when(row.getString("type")).thenReturn(type);
        when(row.getString("actor")).thenReturn(actor);
        when(row.getObject("occurred_at", OffsetDateTime.class)).thenReturn(at.atOffset(ZoneOffset.UTC));
        when(row.getString("details")).thenReturn(details);
        return row;
    }
}
