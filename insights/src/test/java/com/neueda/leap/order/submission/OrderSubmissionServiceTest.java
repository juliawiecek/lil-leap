package com.neueda.leap.order.submission;

import com.neueda.leap.order.submission.dto.OrderSubmissionResponse;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.OrderSubmissionRepository;
import com.neueda.leap.order.submission.service.OrderSubmissionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrderSubmissionServiceTest {

    private OrderSubmissionRepository repository;
    private OrderSubmissionService service;
    private UUID userId;
    private UUID accountId;
    private UUID instrumentId;
    private UUID clientReference;

    @BeforeEach
    void setUp() {
        repository = mock(OrderSubmissionRepository.class);
        service = new OrderSubmissionService(repository);
        userId = UUID.randomUUID();
        accountId = UUID.randomUUID();
        instrumentId = UUID.randomUUID();
        clientReference = UUID.randomUUID();
    }

    @Test
    void validOrderIsPersistedAsSubmitted() {
        SubmitOrderRequest request = request("aapl", "buy", 10);
        OrderSubmissionResponse saved = response("AAPL");
        when(repository.accountBelongsToUser(accountId, userId)).thenReturn(true);
        when(repository.findByAccountAndClientReference(accountId, clientReference)).thenReturn(Optional.empty());
        when(repository.findTradableInstrumentIdBySymbol("AAPL")).thenReturn(Optional.of(instrumentId));
        when(repository.insert(accountId, instrumentId, "AAPL", clientReference, "BUY", 10, "MARKET", null))
                .thenReturn(Optional.of(saved));

        var result = service.submit(userId, request);

        assertTrue(result.created());
        assertEquals("SUBMITTED", result.order().status());
    }

    @Test
    void duplicateClientReferenceReturnsExistingOrder() {
        SubmitOrderRequest request = request("AAPL", "BUY", 10);
        OrderSubmissionResponse existing = response("AAPL");
        when(repository.accountBelongsToUser(accountId, userId)).thenReturn(true);
        when(repository.findByAccountAndClientReference(accountId, clientReference))
                .thenReturn(Optional.of(existing));

        var result = service.submit(userId, request);

        assertFalse(result.created());
        assertEquals(existing.orderId(), result.order().orderId());
        verify(repository, never()).insert(accountId, instrumentId, "AAPL", clientReference, "BUY", 10, "MARKET", null);
    }

    @Test
    void anotherUsersAccountIsHiddenAsNotFound() {
        when(repository.accountBelongsToUser(accountId, userId)).thenReturn(false);
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.submit(userId, request("AAPL", "BUY", 10)));
        assertEquals(404, error.getStatusCode().value());
    }

    @Test
    void unsupportedSymbolIsRejected() {
        when(repository.accountBelongsToUser(accountId, userId)).thenReturn(true);
        when(repository.findByAccountAndClientReference(accountId, clientReference)).thenReturn(Optional.empty());
        when(repository.findTradableInstrumentIdBySymbol("NOPE")).thenReturn(Optional.empty());
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.submit(userId, request("NOPE", "BUY", 10)));
        assertEquals(400, error.getStatusCode().value());
    }

    private SubmitOrderRequest request(String symbol, String side, long quantity) {
        return new SubmitOrderRequest(accountId, symbol, clientReference, side, quantity, "MARKET", null);
    }

    private OrderSubmissionResponse response(String symbol) {
        return new OrderSubmissionResponse(UUID.randomUUID(), accountId, instrumentId, symbol,
                clientReference, "BUY", 10, "MARKET", "SUBMITTED", Instant.now(), null);
    }
}
