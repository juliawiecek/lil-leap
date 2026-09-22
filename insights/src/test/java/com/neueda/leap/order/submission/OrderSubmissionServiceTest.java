package com.neueda.leap.order.submission;

import com.neueda.leap.order.submission.dto.OrderSubmissionResponse;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.OrderSubmissionRepository;
import com.neueda.leap.order.submission.service.OrderSubmissionService;
import com.neueda.leap.order.service.OrderSufficiencyService;
import com.neueda.leap.order.service.OrderSufficiencyException;
import com.neueda.leap.order.service.OrderJurisdictionService;
import com.neueda.leap.order.service.OrderJurisdictionException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.anyLong;

class OrderSubmissionServiceTest {

    private OrderSubmissionRepository repository;
    private OrderSubmissionService service;
    private OrderSufficiencyService sufficiency;
    private OrderJurisdictionService jurisdiction;
    private UUID userId;
    private UUID accountId;
    private UUID instrumentId;
    private UUID clientReference;

    @BeforeEach
    void setUp() {
        repository = mock(OrderSubmissionRepository.class);
        sufficiency = mock(OrderSufficiencyService.class);
        jurisdiction = mock(OrderJurisdictionService.class);
        service = new OrderSubmissionService(repository, sufficiency, jurisdiction);
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
        var sequence = inOrder(jurisdiction, sufficiency, repository);
        sequence.verify(jurisdiction).validate(userId, instrumentId);
        sequence.verify(sufficiency).validate(request, instrumentId);
        sequence.verify(repository).insert(accountId, instrumentId, "AAPL", clientReference, "BUY", 10, "MARKET", null);
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
        verifyNoInteractions(sufficiency, jurisdiction);
        verify(repository, never()).insert(accountId, instrumentId, "AAPL", clientReference, "BUY", 10, "MARKET", null);
    }

    @Test
    void anotherUsersAccountIsHiddenAsNotFound() {
        when(repository.accountBelongsToUser(accountId, userId)).thenReturn(false);
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.submit(userId, request("AAPL", "BUY", 10)));
        assertEquals(404, error.getStatusCode().value());
        verifyNoInteractions(sufficiency, jurisdiction);
    }

    @Test
    void unsupportedSymbolIsRejected() {
        when(repository.accountBelongsToUser(accountId, userId)).thenReturn(true);
        when(repository.findByAccountAndClientReference(accountId, clientReference)).thenReturn(Optional.empty());
        when(repository.findTradableInstrumentIdBySymbol("NOPE")).thenReturn(Optional.empty());
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.submit(userId, request("NOPE", "BUY", 10)));
        assertEquals(400, error.getStatusCode().value());
        verifyNoInteractions(sufficiency, jurisdiction);
    }

    @Test
    void insufficientResourcesPreventOrderInsert() {
        var request = request("AAPL", "BUY", 10);
        when(repository.accountBelongsToUser(accountId, userId)).thenReturn(true);
        when(repository.findTradableInstrumentIdBySymbol("AAPL")).thenReturn(Optional.of(instrumentId));
        doThrow(new OrderSufficiencyException(OrderSufficiencyException.Reason.INSUFFICIENT_CASH))
                .when(sufficiency).validate(request, instrumentId);

        assertThrows(OrderSufficiencyException.class, () -> service.submit(userId, request));

        verify(repository, never()).insert(any(), any(), any(), any(), any(), anyLong(), any(), any());
    }

    private SubmitOrderRequest request(String symbol, String side, long quantity) {
        return new SubmitOrderRequest(accountId, symbol, clientReference, side, quantity, "MARKET", null);
    }

    @ParameterizedTest
    @ValueSource(strings = {"BUY", "SELL"})
    void restrictedLocationPreventsBuyAndSellPersistence(String side) {
        var request = request("AAPL", side, 10);
        when(repository.accountBelongsToUser(accountId, userId)).thenReturn(true);
        when(repository.findTradableInstrumentIdBySymbol("AAPL")).thenReturn(Optional.of(instrumentId));
        doThrow(new OrderJurisdictionException(OrderJurisdictionException.Reason.LOCATION_RESTRICTED))
                .when(jurisdiction).validate(userId, instrumentId);

        assertThrows(OrderJurisdictionException.class, () -> service.submit(userId, request));

        verifyNoInteractions(sufficiency);
        verify(repository, never()).insert(any(), any(), any(), any(), any(), anyLong(), any(), any());
    }

    private OrderSubmissionResponse response(String symbol) {
        return new OrderSubmissionResponse(UUID.randomUUID(), accountId, instrumentId, symbol,
                clientReference, "BUY", 10, "MARKET", "SUBMITTED", Instant.now(), null);
    }
}
