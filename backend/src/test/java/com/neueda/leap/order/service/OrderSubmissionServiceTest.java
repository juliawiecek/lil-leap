package com.neueda.leap.order.service;

import com.neueda.leap.order.api.dto.CreateOrderRequest;
import com.neueda.leap.order.api.dto.OrderResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrderSubmissionServiceTest {

    private JdbcTemplate jdbc;
    private OrderSubmissionService service;
    private UUID userId;
    private UUID accountId;
    private UUID instrumentId;
    private UUID clientReference;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        service = new OrderSubmissionService(jdbc);
        userId = UUID.randomUUID();
        accountId = UUID.randomUUID();
        instrumentId = UUID.randomUUID();
        clientReference = UUID.randomUUID();
    }

    @Test
    void validOrderIsPersistedAsSubmitted() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(accountId), List.of(), List.of(instrumentId));
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

        OrderSubmissionResult result = service.submit(userId, request("AAPL", "BUY", 10L));

        assertTrue(result.created());
        assertEquals("SUBMITTED", result.order().status());
        assertEquals("AAPL", result.order().symbol());
        verify(jdbc).update(anyString(), any(Object[].class));
    }

    @Test
    void duplicateClientReferenceReturnsExistingOrder() {
        OrderResponse existing = existingOrder();
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(accountId), List.of(existing));

        OrderSubmissionResult result = service.submit(userId, request("AAPL", "BUY", 10L));

        assertFalse(result.created());
        assertEquals(existing.orderId(), result.order().orderId());
    }

    @Test
    void accountOwnedByAnotherClientIsHiddenAsNotFound() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> service.submit(userId, request("AAPL", "BUY", 10L))
        );
        assertEquals(404, error.getStatusCode().value());
    }

    @Test
    void unsupportedSymbolIsRejected() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(accountId), List.of(), List.of());

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> service.submit(userId, request("NOTREAL", "BUY", 10L))
        );
        assertEquals(400, error.getStatusCode().value());
    }

    private CreateOrderRequest request(String symbol, String side, Long quantity) {
        return new CreateOrderRequest(
                accountId,
                symbol,
                clientReference,
                side,
                quantity,
                "MARKET",
                new BigDecimal("2.00")
        );
    }

    private OrderResponse existingOrder() {
        return new OrderResponse(
                UUID.randomUUID(), accountId, instrumentId, "AAPL",
                clientReference, "BUY", 10L, "MARKET", "SUBMITTED",
                Instant.now(), new BigDecimal("2.00")
        );
    }
}
