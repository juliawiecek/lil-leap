package com.neueda.leap.order.submission;

import com.neueda.leap.order.submission.dto.OrderSubmissionResponse;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.AccountTradingProfile;
import com.neueda.leap.order.submission.repository.OrderSubmissionRepository;
import com.neueda.leap.order.submission.service.IdempotencyConflictException;
import com.neueda.leap.order.submission.service.OrderSubmissionService;
import com.neueda.leap.order.rules.OrderRuleException;
import com.neueda.leap.instrument.dto.InstrumentResponse;
import com.neueda.leap.instrument.service.InstrumentService;
import com.neueda.leap.order.service.OrderSufficiencyService;
import com.neueda.leap.order.service.OrderSufficiencyException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
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

class OrderSubmissionServiceTest {

    private OrderSubmissionRepository repository;
    private OrderSubmissionService service;
    private final InstrumentService instruments = mock(InstrumentService.class);
    private OrderSufficiencyService sufficiency;
    private UUID userId;
    private UUID accountId;
    private UUID instrumentId;
    private UUID clientReference;

    @BeforeEach
    void setUp() {
        repository = mock(OrderSubmissionRepository.class);
        sufficiency = mock(OrderSufficiencyService.class);
        service = new OrderSubmissionService(repository, sufficiency, instruments);
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
        when(repository.findAccountTradingProfile(accountId)).thenReturn(Optional.of(
                new AccountTradingProfile("ACTIVE", true, "level1", BigDecimal.valueOf(100), BigDecimal.valueOf(1000))));
        when(repository.findByAccountAndClientReference(accountId, clientReference)).thenReturn(Optional.empty());
        when(instruments.findInstrumentBySymbol("AAPL")).thenReturn(Optional.of(instrument(instrumentId, true, true)));
        when(repository.insert(request, instrumentId, "AAPL"))
                .thenReturn(Optional.of(saved));

        var result = service.submit(userId, request);

        assertTrue(result.created());
        assertEquals("SUBMITTED", result.order().status());
        var sequence = inOrder(sufficiency, repository);
        sequence.verify(sufficiency).validate(request, instrumentId);
        sequence.verify(repository).insert(request, instrumentId, "AAPL");
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
        verifyNoInteractions(sufficiency);
        verify(repository, never()).insert(request, instrumentId, "AAPL");
    }

    @Test
    void identicalRetryByInstrumentIdReturnsExistingOrder() {
        var request = new SubmitOrderRequest(accountId, null, clientReference, "buy", 10, null, null, instrumentId);
        when(repository.accountBelongsToUser(accountId, userId)).thenReturn(true);
        when(repository.findByAccountAndClientReference(accountId, clientReference))
                .thenReturn(Optional.of(response("AAPL")));

        assertFalse(service.submit(userId, request).created());
    }

    @Test
    void retryThatChangesTheOrderIsAConflict() {
        when(repository.accountBelongsToUser(accountId, userId)).thenReturn(true);
        when(repository.findByAccountAndClientReference(accountId, clientReference))
                .thenReturn(Optional.of(response("AAPL")));

        assertThrows(IdempotencyConflictException.class, () -> service.submit(userId, request("AAPL", "SELL", 10)));
        assertThrows(IdempotencyConflictException.class, () -> service.submit(userId, request("AAPL", "BUY", 11)));
        assertThrows(IdempotencyConflictException.class, () -> service.submit(userId, request("MSFT", "BUY", 10)));
        assertThrows(IdempotencyConflictException.class, () -> service.submit(userId,
                new SubmitOrderRequest(accountId, "AAPL", clientReference, "BUY", 10, "MARKET", BigDecimal.ONE)));
        verifyNoInteractions(sufficiency);
    }

    @Test
    void concurrentInsertWithAChangedOrderIsAConflict() {
        var request = request("AAPL", "SELL", 10);
        when(repository.accountBelongsToUser(accountId, userId)).thenReturn(true);
        when(repository.findAccountTradingProfile(accountId)).thenReturn(Optional.of(
                new AccountTradingProfile("ACTIVE", true, "level1", BigDecimal.valueOf(100), BigDecimal.valueOf(1000))));
        when(repository.findByAccountAndClientReference(accountId, clientReference))
                .thenReturn(Optional.empty(), Optional.of(response("AAPL")));
        when(instruments.findInstrumentBySymbol("AAPL")).thenReturn(Optional.of(instrument(instrumentId, true, true)));
        when(repository.insert(request, instrumentId, "AAPL"))
                .thenReturn(Optional.empty());

        assertThrows(IdempotencyConflictException.class, () -> service.submit(userId, request));
    }

    @Test
    void anotherUsersAccountIsHiddenAsNotFound() {
        when(repository.accountBelongsToUser(accountId, userId)).thenReturn(false);
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.submit(userId, request("AAPL", "BUY", 10)));
        assertEquals(404, error.getStatusCode().value());
        verifyNoInteractions(sufficiency);
    }

    @Test
    void unsupportedSymbolIsRejected() {
        when(repository.accountBelongsToUser(accountId, userId)).thenReturn(true);
        when(repository.findAccountTradingProfile(accountId)).thenReturn(Optional.of(
                new AccountTradingProfile("ACTIVE", true, "level1", BigDecimal.valueOf(100), BigDecimal.valueOf(1000))));
        when(repository.findByAccountAndClientReference(accountId, clientReference)).thenReturn(Optional.empty());
        when(instruments.findInstrumentBySymbol("NOPE")).thenReturn(Optional.empty());
        assertThrows(OrderRuleException.class,
                () -> service.submit(userId, request("NOPE", "BUY", 10)));
        verifyNoInteractions(sufficiency);
    }

    @Test
    void insufficientResourcesPreventOrderInsert() {
        var request = request("AAPL", "BUY", 10);
        when(repository.accountBelongsToUser(accountId, userId)).thenReturn(true);
        when(repository.findAccountTradingProfile(accountId)).thenReturn(Optional.of(
                new AccountTradingProfile("ACTIVE", true, "level1", BigDecimal.valueOf(100), BigDecimal.valueOf(1000))));
        when(instruments.findInstrumentBySymbol("AAPL")).thenReturn(Optional.of(instrument(instrumentId, true, true)));
        doThrow(new OrderSufficiencyException(OrderSufficiencyException.Reason.INSUFFICIENT_CASH))
                .when(sufficiency).validate(request, instrumentId);

        assertThrows(OrderSufficiencyException.class, () -> service.submit(userId, request));

        verify(repository, never()).insert(any(), any(), any());
    }

    private SubmitOrderRequest request(String symbol, String side, long quantity) {
        return new SubmitOrderRequest(accountId, symbol, clientReference, side, quantity, "MARKET", null);
    }

    private OrderSubmissionResponse response(String symbol) {
        return new OrderSubmissionResponse(UUID.randomUUID(), accountId, instrumentId, symbol,
                clientReference, "BUY", 10, "MARKET", "SUBMITTED", Instant.now(), null);
    }
    private static InstrumentResponse instrument(UUID id, boolean enabled, boolean tradable) {
        return new InstrumentResponse(id, "AAPL", "Apple Inc.", "COMMON_STOCK",
                "NASDAQ", "USD", "Technology", enabled, tradable);
    }
}
