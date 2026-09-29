package com.neueda.leap.order.service;

import com.neueda.leap.order.dto.OrderSubmissionResponse;
import com.neueda.leap.order.dto.SubmitOrderRequest;
import com.neueda.leap.order.exception.InvalidOrderException;
import com.neueda.leap.order.exception.OrderAccountNotFoundException;
import com.neueda.leap.order.model.Account;
import com.neueda.leap.order.model.Instrument;
import com.neueda.leap.order.model.Order;
import com.neueda.leap.order.model.OrderStatusHistory;
import com.neueda.leap.order.repository.InstrumentRepository;
import com.neueda.leap.order.repository.OrderAccountRepository;
import com.neueda.leap.order.repository.OrderRepository;
import com.neueda.leap.order.repository.OrderStatusHistoryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests for OrderSubmissionService (NEXT-189).
 */
@ExtendWith(MockitoExtension.class)
class OrderSubmissionServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private OrderAccountRepository accountRepository;

    @Mock
    private InstrumentRepository instrumentRepository;

    @Mock
    private OrderStatusHistoryRepository statusHistoryRepository;

    private OrderSubmissionService service;

    private final UUID userId = UUID.randomUUID();
    private final UUID accountId = UUID.randomUUID();
    private final UUID instrumentId = UUID.randomUUID();
    private Account account;
    private Instrument instrument;

    @BeforeEach
    void setUp() {
        service = new OrderSubmissionService(orderRepository, accountRepository, instrumentRepository,
                statusHistoryRepository, new OrderValidationService());
        account = new Account();
        account.setAccountId(accountId);
        account.setUserId(userId);
        instrument = new Instrument();
        instrument.setInstrumentId(instrumentId);
    }

    private void givenOwnedAccountAndKnownInstrument() {
        when(accountRepository.findByAccountIdAndUserId(accountId, userId)).thenReturn(Optional.of(account));
        when(instrumentRepository.findById(instrumentId)).thenReturn(Optional.of(instrument));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private Order savedOrder() {
        ArgumentCaptor<Order> saved = ArgumentCaptor.forClass(Order.class);
        verify(orderRepository).save(saved.capture());
        return saved.getValue();
    }

    @Test
    void submitPersistsOrderAndReturnsItsId() {
        givenOwnedAccountAndKnownInstrument();
        UUID clientReference = UUID.randomUUID();

        OrderSubmissionResponse response = service.submit(userId,
                new SubmitOrderRequest(accountId, instrumentId, "buy", 10L, clientReference));

        Order order = savedOrder();
        assertNotNull(order.getOrderId());
        assertEquals(order.getOrderId(), response.orderId());
        assertEquals("PENDING", response.status());
        assertEquals(clientReference, response.clientReference());
        assertEquals("BUY", order.getSide());
        assertEquals(10L, order.getQuantity());
        assertEquals("MARKET", order.getOrderType());
        assertSame(account, order.getAccount());
        assertSame(instrument, order.getInstrument());
    }

    @Test
    void submitSetsFieldsTheSchedulerNeedsToPickTheOrderUp() {
        givenOwnedAccountAndKnownInstrument();
        Instant before = Instant.now();

        service.submit(userId, new SubmitOrderRequest(accountId, instrumentId, "SELL", 5L, null));

        // OrderRepository.findDueForExecution: status ACCEPTED/PENDING, accepted_at set, next_execution_at <= now
        Order order = savedOrder();
        assertEquals("PENDING", order.getStatus());
        assertNotNull(order.getAcceptedAt());
        assertFalse(order.getAcceptedAt().isBefore(before));
        assertFalse(order.getNextExecutionAt().isAfter(Instant.now()));
        assertEquals(0L, order.getExecutionAttempts());
    }

    @Test
    void submitGeneratesClientReferenceWhenNoneSupplied() {
        givenOwnedAccountAndKnownInstrument();

        OrderSubmissionResponse response = service.submit(userId,
                new SubmitOrderRequest(accountId, instrumentId, "BUY", 1L, null));

        assertNotNull(response.clientReference());
        assertEquals(response.clientReference(), savedOrder().getClientReference());
    }

    @Test
    void submitRecordsAcceptanceInStatusHistory() {
        givenOwnedAccountAndKnownInstrument();

        service.submit(userId, new SubmitOrderRequest(accountId, instrumentId, "BUY", 1L, null));

        ArgumentCaptor<OrderStatusHistory> history = ArgumentCaptor.forClass(OrderStatusHistory.class);
        verify(statusHistoryRepository).save(history.capture());
        assertEquals("PENDING", history.getValue().getStatus());
        assertEquals("ORDER_ACCEPTED", history.getValue().getReasonCode());
    }

    @Test
    void submitRejectsAccountNotOwnedByCallerWithoutWritingAnything() {
        when(accountRepository.findByAccountIdAndUserId(accountId, userId)).thenReturn(Optional.empty());
        SubmitOrderRequest request = new SubmitOrderRequest(accountId, instrumentId, "BUY", 1L, null);

        assertThrows(OrderAccountNotFoundException.class, () -> service.submit(userId, request));

        verifyNoInteractions(orderRepository, statusHistoryRepository);
    }

    @Test
    void submitRejectsUnknownInstrumentWithoutWritingAnything() {
        when(accountRepository.findByAccountIdAndUserId(accountId, userId)).thenReturn(Optional.of(account));
        when(instrumentRepository.findById(instrumentId)).thenReturn(Optional.empty());
        SubmitOrderRequest request = new SubmitOrderRequest(accountId, instrumentId, "BUY", 1L, null);

        assertThrows(InvalidOrderException.class, () -> service.submit(userId, request));

        verifyNoInteractions(orderRepository, statusHistoryRepository);
    }
}
