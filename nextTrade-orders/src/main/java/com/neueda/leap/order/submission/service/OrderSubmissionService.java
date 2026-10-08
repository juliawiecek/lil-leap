package com.neueda.leap.order.submission.service;

import com.neueda.leap.order.rules.OrderRuleException;
import com.neueda.leap.instrument.dto.InstrumentResponse;
import com.neueda.leap.instrument.service.InstrumentService;
import com.neueda.leap.order.submission.dto.OrderSubmissionResponse;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.AccountTradingProfile;
import com.neueda.leap.order.submission.repository.OrderSubmissionRepository;
import com.neueda.leap.order.service.OrderSufficiencyService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.UUID;
import static com.neueda.leap.order.rules.OrderRuleException.Reason.*;

/**
 * Authorizes account ownership and validates trading rules before persisting an idempotent submission.
 * Resource checks do not reserve cash or shares.
 */
@Service
public class OrderSubmissionService {
    private final OrderSubmissionRepository repository;
    private final OrderSufficiencyService sufficiency;
    private final InstrumentService instruments;
    /**
     * Creates a {@code OrderSubmissionService} with the supplied dependencies.
     *
     * @param repository persistence operations used by this service
     * @param sufficiency cash and holdings validation service
     * @param instruments current metadata shared with the instrument catalog API
     */
    public OrderSubmissionService(OrderSubmissionRepository repository, OrderSufficiencyService sufficiency,
                                  InstrumentService instruments) {
        this.repository = repository;
        this.sufficiency = sufficiency;
        this.instruments = instruments;
    }

    /**
     * Submits an order after authentication, ownership, eligibility and resource checks.
     * An identical retry of an existing account/client-reference pair returns its original
     * order before business rules are rechecked; a retry that changes the order is a conflict.
     * Concurrent duplicate inserts resolve the same way.
     * Cash and shares are checked but are not reserved by this operation.
     *
     * @param authenticatedUserId user identifier from the authenticated principal
     * @param request non-null request that has passed Bean Validation at the API boundary
     * @return submission result indicating whether a new row was created
     * @throws ResponseStatusException with HTTP 401 for missing identity or 404 for an absent or unowned account
     * @throws IdempotencyConflictException if the client reference already created a different order
     * @throws OrderRuleException if account or instrument trading rules reject the submission
     * @throws com.neueda.leap.order.service.OrderSufficiencyException if resources or a usable buy quote are missing
     * @throws IllegalStateException if a conflicting submission cannot be read
     */
    @Transactional
    public OrderSubmissionResult submit(UUID authenticatedUserId, SubmitOrderRequest request) {
        if (authenticatedUserId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        }
        if (!repository.accountBelongsToUser(request.accountId(), authenticatedUserId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found");
        }
        var existing = repository.findByAccountAndClientReference(request.accountId(), request.clientReference());
        if (existing.isPresent()) {
            return replay(existing.get(), request);
        }

        validateAccount(repository.findAccountTradingProfile(request.accountId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found")));

        InstrumentResponse instrument = (request.instrumentId() == null
                ? instruments.findInstrumentBySymbol(request.normalizedSymbol())
                : instruments.findInstrumentById(request.instrumentId()))
                .orElseThrow(() -> new OrderRuleException(INSTRUMENT_UNSUPPORTED));
        String symbol = instrument.symbol();
        if (!instrument.enabled()) throw new OrderRuleException(INSTRUMENT_DISABLED);
        if (!instrument.tradable()) throw new OrderRuleException(INSTRUMENT_NOT_TRADABLE);

        sufficiency.validate(request, instrument.instrumentId());
        var saved = repository.insert(request, instrument.instrumentId(), symbol);
        return saved.map(order -> new OrderSubmissionResult(order, true))
                .orElseGet(() -> repository.findByAccountAndClientReference(
                                request.accountId(), request.clientReference())
                        .map(order -> replay(order, request))
                        .orElseThrow(() -> new IllegalStateException("Conflicting order is unavailable")));
    }

    /** Returns the stored order for an identical retry; a changed payload must not be silently dropped. */
    private static OrderSubmissionResult replay(OrderSubmissionResponse existing, SubmitOrderRequest request) {
        if (!sameOrder(existing, request)) {
            throw new IdempotencyConflictException();
        }
        return new OrderSubmissionResult(existing, false);
    }

    private static boolean sameOrder(OrderSubmissionResponse existing, SubmitOrderRequest request) {
        boolean sameInstrument = request.instrumentId() != null
                ? request.instrumentId().equals(existing.instrumentId())
                : request.normalizedSymbol().equalsIgnoreCase(existing.symbol());
        boolean sameTerms = request.normalizedSide().equals(existing.side())
                && request.quantity() == existing.quantity()
                && request.normalizedOrderType().equals(existing.orderType());
        return sameInstrument && sameTerms && sameBuffer(request.bufferPercent(), existing.bufferPercent());
    }

    /** Compares buffers by value, so 5 and 5.00 match; two absent buffers also match. */
    private static boolean sameBuffer(BigDecimal requested, BigDecimal stored) {
        if (requested == null || stored == null) {
            return requested == null && stored == null;
        }
        return requested.compareTo(stored) == 0;
    }

    private static void validateAccount(AccountTradingProfile account) {
        if (!"ACTIVE".equals(account.accountStatus())) throw new OrderRuleException(ACCOUNT_NOT_ACTIVE);
        if (!account.tradingEnabled()) throw new OrderRuleException(TRADING_NOT_ENABLED);
        if (account.currentBalance().compareTo(account.minimumBalanceRequirement()) < 0) {
            throw new OrderRuleException(ACCOUNT_NOT_SUITABLE);
        }
    }
}
