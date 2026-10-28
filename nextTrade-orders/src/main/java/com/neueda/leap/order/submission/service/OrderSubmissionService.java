package com.neueda.leap.order.submission.service;

import com.neueda.leap.order.execution.quote.IndicativePriceService;
import com.neueda.leap.order.rules.LocationPolicy;
import com.neueda.leap.order.rules.OrderRuleException;
import com.neueda.leap.instrument.dto.InstrumentResponse;
import com.neueda.leap.instrument.service.InstrumentService;
import com.neueda.leap.order.service.OrderSufficiencyException;
import com.neueda.leap.order.submission.audit.RuleChecks;
import com.neueda.leap.order.submission.audit.SubmissionAuditRepository;
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
import java.util.Optional;
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
    private final IndicativePriceService prices;
    private final SubmissionAuditRepository audit;
    /**
     * Creates a {@code OrderSubmissionService} with the supplied dependencies.
     *
     * @param repository persistence operations used by this service
     * @param sufficiency cash and holdings validation service
     * @param instruments current metadata shared with the instrument catalog API
     * @param prices latest stored quote, recorded as the order's reference price for price protection
     * @param audit records every rule checked, and refused submissions (TS-15.5)
     */
    public OrderSubmissionService(OrderSubmissionRepository repository, OrderSufficiencyService sufficiency,
                                  InstrumentService instruments, IndicativePriceService prices,
                                  SubmissionAuditRepository audit) {
        this.repository = repository;
        this.sufficiency = sufficiency;
        this.instruments = instruments;
        this.prices = prices;
        this.audit = audit;
    }

    /**
     * Submits an order under a fresh request id; see {@link #submit(UUID, SubmitOrderRequest, UUID)}.
     *
     * @param authenticatedUserId user identifier from the authenticated principal
     * @param request non-null request that has passed Bean Validation at the API boundary
     * @return submission result indicating whether a new row was created
     */
    @Transactional
    public OrderSubmissionResult submit(UUID authenticatedUserId, SubmitOrderRequest request) {
        return submit(authenticatedUserId, request, UUID.randomUUID());
    }

    /**
     * Submits an order after authentication, ownership, eligibility and resource checks.
     * An identical retry of an existing account/client-reference pair returns its original
     * order before business rules are rechecked; a retry that changes the order is a conflict.
     * Concurrent duplicate inserts resolve the same way.
     * Cash and shares are checked but are not reserved by this operation.
     * Every rule checked is recorded under {@code requestId}: with the order when it is accepted, and
     * in its own transaction before the refusal is returned when it is not (TS-15.5).
     *
     * @param authenticatedUserId user identifier from the authenticated principal
     * @param request non-null request that has passed Bean Validation at the API boundary
     * @param requestId the id returned to the client as {@code X-Request-Id}
     * @return submission result indicating whether a new row was created
     * @throws ResponseStatusException with HTTP 401 for missing identity or 404 for an absent or unowned account
     * @throws IdempotencyConflictException if the client reference already created a different order
     * @throws OrderRuleException if account or instrument trading rules reject the submission
     * @throws com.neueda.leap.order.service.OrderSufficiencyException if resources or a usable buy quote are missing
     * @throws IllegalStateException if a conflicting submission cannot be read
     */
    @Transactional
    public OrderSubmissionResult submit(UUID authenticatedUserId, SubmitOrderRequest request, UUID requestId) {
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

        AccountTradingProfile account = repository.findAccountTradingProfile(request.accountId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found"));
        RuleChecks checks = new RuleChecks();
        InstrumentResponse instrument;
        try {
            instrument = checkRules(request, account, checks);
        } catch (OrderRuleException refused) {
            // Recorded before the refusal is returned; if this write fails the client gets a 500, never an unrecorded refusal.
            audit.recordRefused(authenticatedUserId, request, requestId, refused.reason().name(), checks.list());
            throw refused;
        } catch (OrderSufficiencyException refused) {
            audit.recordRefused(authenticatedUserId, request, requestId, refused.reason().name(), checks.list());
            throw refused;
        }
        // Price protection (PS-12) measures moves from the price orders itself saw; never one sent by the client.
        BigDecimal referencePrice = prices.estimate(instrument.instrumentId(), request.normalizedSide(), request.quantity())
                .map(IndicativePriceService.IndicativePrice::indicativePrice).orElse(null);
        BigDecimal entry = "LIMIT".equals(request.normalizedOrderType()) ? request.limitPrice() : referencePrice;
        validateExits(request, entry);
        var saved = repository.insert(request, instrument.instrumentId(), instrument.symbol(), referencePrice);
        saved.ifPresent(order -> audit.recordAccepted(
                authenticatedUserId, request.accountId(), order.orderId(), requestId, checks.list()));
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
        boolean samePrices = sameBuffer(request.limitPrice(), existing.limitPrice())
                && sameBuffer(request.takeProfitPrice(), existing.takeProfitPrice())
                && sameBuffer(request.stopLossPrice(), existing.stopLossPrice());
        return sameInstrument && sameTerms && sameBuffer(request.bufferPercent(), existing.bufferPercent()) && samePrices;
    }

    static void validateExits(SubmitOrderRequest request, BigDecimal entry) {
        if (request.takeProfitPrice() == null && request.stopLossPrice() == null) return;
        if (entry == null || entry.signum() <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An entry price is required for exits");
        boolean buy = "BUY".equals(request.normalizedSide());
        if (request.takeProfitPrice() != null && (buy ? request.takeProfitPrice().compareTo(entry) <= 0 : request.takeProfitPrice().compareTo(entry) >= 0))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Take profit must be on the profitable side of entry");
        if (request.stopLossPrice() != null && (buy ? request.stopLossPrice().compareTo(entry) >= 0 : request.stopLossPrice().compareTo(entry) <= 0))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stop loss must be on the loss side of entry");
    }

    /** Compares buffers by value, so 5 and 5.00 match; two absent buffers also match. */
    private static boolean sameBuffer(BigDecimal requested, BigDecimal stored) {
        if (requested == null || stored == null) {
            return requested == null && stored == null;
        }
        return requested.compareTo(stored) == 0;
    }

    /** Runs every trading rule in order, recording each outcome; the first failure refuses the order. */
    private InstrumentResponse checkRules(SubmitOrderRequest request, AccountTradingProfile account, RuleChecks checks) {
        checks.require("ACCOUNT_ACTIVE", "ACTIVE".equals(account.accountStatus()), ACCOUNT_NOT_ACTIVE);
        checks.require("TRADING_ENABLED", account.tradingEnabled(), TRADING_NOT_ENABLED);
        Optional<InstrumentResponse> found = request.instrumentId() == null
                ? instruments.findInstrumentBySymbol(request.normalizedSymbol())
                : instruments.findInstrumentById(request.instrumentId());
        checks.require("INSTRUMENT_SUPPORTED", found.isPresent(), INSTRUMENT_UNSUPPORTED);
        InstrumentResponse instrument = found.orElseThrow();
        checks.require("INSTRUMENT_ENABLED", instrument.enabled(), INSTRUMENT_DISABLED);
        checks.require("INSTRUMENT_TRADABLE", instrument.tradable(), INSTRUMENT_NOT_TRADABLE);
        String country = repository.findClientCountry(request.accountId()).orElse(null);
        checks.require("LOCATION", LocationPolicy.permits(country, instrument.marketCode()), LOCATION_RESTRICTED);
        try {
            sufficiency.validate(request, instrument.instrumentId());
        } catch (OrderSufficiencyException insufficient) {
            checks.fail("SUFFICIENCY", insufficient.reason().name());
            throw insufficient;
        }
        checks.pass("SUFFICIENCY");
        return instrument;
    }
}
