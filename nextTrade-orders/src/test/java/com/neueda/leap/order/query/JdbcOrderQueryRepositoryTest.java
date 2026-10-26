package com.neueda.leap.order.query;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcOrderQueryRepositoryTest {
    private static final Instant SUBMITTED = Instant.parse("2026-10-01T10:00:00Z");

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final JdbcOrderQueryRepository repository = new JdbcOrderQueryRepository(jdbc);
    private final UUID order = UUID.randomUUID();
    private final UUID user = UUID.randomUUID();

    @Test
    @SuppressWarnings("unchecked")
    void detailIsScopedToTheCallerAndMapsAFilledOrder() throws Exception {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(order), eq(user))).thenReturn(List.of());
        assertTrue(repository.findDetail(order, user).isEmpty());

        ArgumentCaptor<RowMapper<OrderDetailResponse>> mapper = ArgumentCaptor.forClass(RowMapper.class);
        verify(jdbc).query(contains("a.user_id = ?"), mapper.capture(), eq(order), eq(user));

        UUID account = UUID.randomUUID();
        UUID instrument = UUID.randomUUID();
        UUID reference = UUID.randomUUID();
        ResultSet rs = mock(ResultSet.class);
        when(rs.getObject("order_id", UUID.class)).thenReturn(order);
        when(rs.getObject("account_id", UUID.class)).thenReturn(account);
        when(rs.getObject("instrument_id", UUID.class)).thenReturn(instrument);
        when(rs.getString("symbol")).thenReturn("AAPL");
        when(rs.getObject("client_reference", UUID.class)).thenReturn(reference);
        when(rs.getString("side")).thenReturn("BUY");
        when(rs.getLong("quantity")).thenReturn(10L);
        when(rs.getString("order_type")).thenReturn("MARKET");
        when(rs.getString("status")).thenReturn("FILLED");
        when(rs.getTimestamp("submitted_at")).thenReturn(Timestamp.from(SUBMITTED));
        when(rs.getTimestamp("accepted_at")).thenReturn(Timestamp.from(SUBMITTED.plusSeconds(1)));
        when(rs.getTimestamp("updated_at")).thenReturn(Timestamp.from(SUBMITTED.plusSeconds(2)));
        when(rs.getBigDecimal("buffer_percent")).thenReturn(new BigDecimal("2.00"));
        when(rs.getObject("filled_quantity", Long.class)).thenReturn(10L);
        when(rs.getBigDecimal("execution_price")).thenReturn(new BigDecimal("220.00"));
        when(rs.getTimestamp("filled_at")).thenReturn(Timestamp.from(SUBMITTED.plusSeconds(2)));

        OrderDetailResponse detail = mapper.getValue().mapRow(rs, 0);

        assertEquals(new OrderDetailResponse(order, account, instrument, "AAPL", reference, "BUY", 10L, "MARKET",
                "FILLED", SUBMITTED, SUBMITTED.plusSeconds(1), SUBMITTED.plusSeconds(2), new BigDecimal("2.00"),
                10L, new BigDecimal("220.00"), SUBMITTED.plusSeconds(2)), detail);
    }

    @Test
    @SuppressWarnings("unchecked")
    void statusIsScopedToTheCallerAndToleratesAnOrderWithoutHistory() throws Exception {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(order), eq(user))).thenReturn(List.of());
        assertTrue(repository.findStatus(order, user).isEmpty());

        ArgumentCaptor<RowMapper<OrderStatusResponse>> mapper = ArgumentCaptor.forClass(RowMapper.class);
        verify(jdbc).query(contains("a.user_id = ?"), mapper.capture(), eq(order), eq(user));

        ResultSet rs = mock(ResultSet.class);
        when(rs.getObject("order_id", UUID.class)).thenReturn(order);
        when(rs.getString("status")).thenReturn("SUBMITTED");

        OrderStatusResponse status = mapper.getValue().mapRow(rs, 0);

        assertEquals(order, status.orderId());
        assertEquals("SUBMITTED", status.status());
        assertNull(status.reasonCode());
        assertNull(status.statusChangedAt());
    }

    @Test
    @SuppressWarnings("unchecked")
    void trailIsReadOnlyAfterOwnershipIsConfirmed() {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(order), eq(user))).thenReturn(List.of());

        assertTrue(repository.findEvents(order, user).isEmpty());
        verify(jdbc).query(contains("a.user_id = ?"), any(RowMapper.class), eq(order), eq(user));
        verify(jdbc, org.mockito.Mockito.never()).query(anyString(), any(RowMapper.class), eq(order), eq(order));
    }

    @Test
    @SuppressWarnings("unchecked")
    void trailJoinsStatusHistoryWithPricingAndSettlementAuditRowsAndMapsPayloads() throws Exception {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(order), eq(user))).thenReturn(List.of("FILLED"));
        when(jdbc.query(anyString(), any(RowMapper.class), eq(order), eq(order))).thenReturn(List.of());

        OrderEventsResponse trail = repository.findEvents(order, user).orElseThrow();
        assertEquals("FILLED", trail.status());
        assertEquals(List.of(), trail.events());

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<RowMapper<OrderEvent>> mapper = ArgumentCaptor.forClass(RowMapper.class);
        verify(jdbc).query(sql.capture(), mapper.capture(), eq(order), eq(order));
        assertTrue(sql.getValue().contains("order_status_history"));
        assertTrue(sql.getValue().contains("'PRICE_DECISION', 'SETTLEMENT_COMPLETED'"));
        assertTrue(sql.getValue().contains("ORDER BY occurred_at, rank"));

        ResultSet priced = mock(ResultSet.class);
        when(priced.getString("type")).thenReturn("PRICE_DECISION");
        when(priced.getString("payload")).thenReturn("{\"actualPrice\": 101.5, \"attemptNumber\": 1}");
        when(priced.getTimestamp("occurred_at")).thenReturn(Timestamp.from(SUBMITTED.plusSeconds(2)));
        OrderEvent decision = mapper.getValue().mapRow(priced, 0);
        assertEquals("PRICE_DECISION", decision.type());
        assertEquals(101.5, decision.details().get("actualPrice"));
        assertEquals(1, decision.details().get("attemptNumber"));
        assertEquals(SUBMITTED.plusSeconds(2), decision.at());
        assertNull(decision.reasonCode());

        ResultSet rejected = mock(ResultSet.class);
        when(rejected.getString("type")).thenReturn("REJECTED");
        when(rejected.getString("reason_code")).thenReturn("PRICE_MOVED");
        when(rejected.getString("reason_text")).thenReturn("The price rose 3.1%");
        when(rejected.getTimestamp("occurred_at")).thenReturn(Timestamp.from(SUBMITTED.plusSeconds(3)));
        OrderEvent refusal = mapper.getValue().mapRow(rejected, 1);
        assertEquals("PRICE_MOVED", refusal.reasonCode());
        assertEquals("The price rose 3.1%", refusal.reasonText());
        assertEquals(java.util.Map.of(), refusal.details());
    }
}
