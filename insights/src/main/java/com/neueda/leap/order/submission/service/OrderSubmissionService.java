package com.neueda.leap.order.submission.service;

import com.neueda.leap.order.rules.OrderRuleException;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.AccountTradingProfile;
import com.neueda.leap.order.submission.repository.InstrumentTradingProfile;
import com.neueda.leap.order.submission.repository.OrderSubmissionRepository;
import com.neueda.leap.order.service.OrderSufficiencyService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
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
    /**
     * Creates a {@code OrderSubmissionService} with the supplied dependencies.
     *
     * @param repository persistence operations used by this service
     * @param sufficiency cash and holdings validation service
     */
    public OrderSubmissionService(OrderSubmissionRepository repository, OrderSufficiencyService sufficiency) {
        this.repository = repository; this.sufficiency = sufficiency;
    }

    /**
     * Submits an order after authentication, ownership, eligibility and resource checks.
     * An existing account/client-reference pair returns its original order before business
     * rules are rechecked. Concurrent duplicate inserts also resolve to the existing order.
     * Cash and shares are checked but are not reserved by this operation.
     *
     * @param authenticatedUserId user identifier from the authenticated principal
     * @param request non-null request that has passed Bean Validation at the API boundary
     * @return submission result indicating whether a new row was created
     * @throws ResponseStatusException with HTTP 401 for missing identity or 404 for an absent or unowned account
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
        if (existing.isPresent()) return new OrderSubmissionResult(existing.get(), false);

        validateAccount(repository.findAccountTradingProfile(request.accountId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found")));

        String symbol = request.normalizedSymbol();
        InstrumentTradingProfile instrument = repository.findInstrumentTradingProfileBySymbol(symbol)
                .orElseThrow(() -> new OrderRuleException(INSTRUMENT_UNSUPPORTED));
        if (!instrument.enabled()) throw new OrderRuleException(INSTRUMENT_DISABLED);
        if (!instrument.tradable()) throw new OrderRuleException(INSTRUMENT_NOT_TRADABLE);

        sufficiency.validate(request, instrument.instrumentId());
        var saved = repository.insert(request.accountId(), instrument.instrumentId(), symbol,
                request.clientReference(), request.normalizedSide(), request.quantity(),
                request.normalizedOrderType(), request.bufferPercent());
        return saved.map(order -> new OrderSubmissionResult(order, true))
                .orElseGet(() -> repository.findByAccountAndClientReference(
                                request.accountId(), request.clientReference())
                        .map(order -> new OrderSubmissionResult(order, false))
                        .orElseThrow(() -> new IllegalStateException("Conflicting order is unavailable")));
    }

    private static void validateAccount(AccountTradingProfile account) {
        if (!"ACTIVE".equals(account.accountStatus())) throw new OrderRuleException(ACCOUNT_NOT_ACTIVE);
        if (!account.tradingEnabled()) throw new OrderRuleException(TRADING_NOT_ENABLED);
        if (account.currentBalance().compareTo(account.minimumBalanceRequirement()) < 0) {
            throw new OrderRuleException(ACCOUNT_NOT_SUITABLE);
        }
    }
}
