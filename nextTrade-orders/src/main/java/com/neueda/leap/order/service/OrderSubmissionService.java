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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

/**
 * Creates orders from client submissions.
 *
 * <p>BR-04, BR-06: a valid submission is recorded as a firm commitment before
 * execution. The order is saved as {@code PENDING} with {@code accepted_at} set,
 * so {@link OrderExecutionScheduler} picks it up without further changes.
 * Validation here is field-level only; business-rule checks (permission,
 * sufficiency, tradability, jurisdiction) layer on top in separate tickets.</p>
 */
@Service
public class OrderSubmissionService {

    /** Status a newly accepted order is saved with; the scheduler picks this up. */
    static final String INITIAL_STATUS = "PENDING";

    private final OrderRepository orderRepository;
    private final OrderAccountRepository accountRepository;
    private final InstrumentRepository instrumentRepository;
    private final OrderStatusHistoryRepository statusHistoryRepository;
    private final OrderValidationService validationService;

    /**
     * Creates the order submission service.
     *
     * @param orderRepository order persistence
     * @param accountRepository account lookup scoped to the caller
     * @param instrumentRepository instrument lookup
     * @param statusHistoryRepository status history persistence
     * @param validationService field-level order validation
     */
    public OrderSubmissionService(OrderRepository orderRepository,
                                  OrderAccountRepository accountRepository,
                                  InstrumentRepository instrumentRepository,
                                  OrderStatusHistoryRepository statusHistoryRepository,
                                  OrderValidationService validationService) {
        this.orderRepository = orderRepository;
        this.accountRepository = accountRepository;
        this.instrumentRepository = instrumentRepository;
        this.statusHistoryRepository = statusHistoryRepository;
        this.validationService = validationService;
    }

    /**
     * Validates and persists a new order for the authenticated caller.
     *
     * @param userId authenticated user's identifier
     * @param request submission payload, already bean-validated
     * @return the created order's identifier, client reference and status
     * @throws OrderAccountNotFoundException if the account is absent or not the caller's
     * @throws InvalidOrderException if the instrument is unknown
     * @throws IllegalArgumentException if the order fails field-level validation
     */
    @Transactional
    public OrderSubmissionResponse submit(UUID userId, SubmitOrderRequest request) {
        Account account = accountRepository.findByAccountIdAndUserId(request.accountId(), userId)
                .orElseThrow(() -> new OrderAccountNotFoundException("Account not found"));
        Instrument instrument = instrumentRepository.findById(request.instrumentId())
                .orElseThrow(() -> new InvalidOrderException("Unknown instrument"));

        UUID clientReference = request.clientReference() != null
                ? request.clientReference()
                : UUID.randomUUID();
        Order order = new Order(UUID.randomUUID(), account, instrument, clientReference,
                request.side().toUpperCase(Locale.ROOT), request.quantity(), "MARKET", INITIAL_STATUS);
        order.setAcceptedAt(Instant.now());
        validationService.validate(order);

        Order saved = orderRepository.save(order);
        statusHistoryRepository.save(new OrderStatusHistory(
                UUID.randomUUID(), saved, INITIAL_STATUS, "ORDER_ACCEPTED", "Order accepted for execution"));

        return new OrderSubmissionResponse(saved.getOrderId(), saved.getClientReference(), saved.getStatus());
    }
}
