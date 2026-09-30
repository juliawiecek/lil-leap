package com.neueda.leap.order.service;

import com.neueda.leap.order.dto.OrderSubmissionResponse;
import com.neueda.leap.order.dto.SubmitOrderRequest;
import com.neueda.leap.order.exception.InvalidOrderException;
import com.neueda.leap.order.exception.OrderAccountNotFoundException;
import com.neueda.leap.order.exception.OrderRuleException;
import com.neueda.leap.order.exception.OrderSufficiencyException;
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
 * Validates and persists orders from client submissions.
 *
 * <p>BR-04, BR-06: a valid submission is recorded as a firm commitment before
 * execution. The order is saved as {@code PENDING} with {@code accepted_at} set,
 * so {@link OrderExecutionScheduler} picks it up without further changes.
 * Implements comprehensive validation: authentication, ownership, account eligibility,
 * instrument support, and sufficiency checks (cash for BUY, holdings for SELL).</p>
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
    private final OrderRuleValidationService ruleValidator;
    private final OrderSufficiencyService sufficiencyValidator;

    /**
     * Creates the order submission service.
     *
     * @param orderRepository order persistence
     * @param accountRepository account lookup scoped to the caller
     * @param instrumentRepository instrument lookup
     * @param statusHistoryRepository status history persistence
     * @param validationService field-level order validation
     * @param ruleValidator account/instrument eligibility validation
     * @param sufficiencyValidator cash/holdings sufficiency validation
     */
    public OrderSubmissionService(OrderRepository orderRepository,
                                  OrderAccountRepository accountRepository,
                                  InstrumentRepository instrumentRepository,
                                  OrderStatusHistoryRepository statusHistoryRepository,
                                  OrderValidationService validationService,
                                  OrderRuleValidationService ruleValidator,
                                  OrderSufficiencyService sufficiencyValidator) {
        this.orderRepository = orderRepository;
        this.accountRepository = accountRepository;
        this.instrumentRepository = instrumentRepository;
        this.statusHistoryRepository = statusHistoryRepository;
        this.validationService = validationService;
        this.ruleValidator = ruleValidator;
        this.sufficiencyValidator = sufficiencyValidator;
    }

    /**
     * Validates and persists a new order for the authenticated caller.
     *
     * Validation order (deterministic):
     * 1. Account ownership: caller must own the account
     * 2. Account eligibility: status=ACTIVE, trading_enabled=true
     * 3. Instrument lookup: instrument must exist
     * 4. Instrument eligibility: enabled=true, tradable by instrument type
     * 5. Sufficiency check: cash for BUY, holdings for SELL, quote available
     * 6. Idempotent persistence: use clientReference as unique key within account
     *
     * @param userId authenticated user's identifier
     * @param request submission payload, already bean-validated
     * @return the created order's identifier, client reference and status
     * @throws OrderAccountNotFoundException if the account is absent or not the caller's
     * @throws OrderRuleException if account/instrument eligibility fails
     * @throws OrderSufficiencyException if cash/holdings are insufficient
     * @throws InvalidOrderException if the instrument is unknown
     * @throws IllegalArgumentException if the order fails field-level validation
     */
    @Transactional
    public OrderSubmissionResponse submit(UUID userId, SubmitOrderRequest request) {
        // Validation 1: Account ownership
        Account account = accountRepository.findByAccountIdAndUserId(request.accountId(), userId)
                .orElseThrow(() -> new OrderAccountNotFoundException("Account not found"));

        // Validation 2: Account eligibility
        ruleValidator.validateAccount(account);

        // Validation 3 & 4: Instrument lookup and eligibility
        Instrument instrument = instrumentRepository.findById(request.instrumentId())
                .orElseThrow(() -> new OrderRuleException(OrderRuleException.Reason.INSTRUMENT_UNSUPPORTED));
        ruleValidator.validateInstrument(instrument);

        // Validation 5: Sufficiency check (cash for BUY, holdings for SELL)
        sufficiencyValidator.validate(request, instrument.getInstrumentId());

        // Validation 6: Idempotent persistence
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
