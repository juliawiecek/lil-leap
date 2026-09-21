package com.neueda.leap.order.submission.service;

import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.OrderSubmissionRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/**
 * Submits orders for accounts owned by the authenticated user.
 * Retries reuse the order identified by account and client reference, even if
 * the retry supplies different order details. Acceptance commits before the database
 * worker can claim the order; submission does not execute a trade.
 */
@Service
public class OrderSubmissionService {

    private final OrderSubmissionRepository repository;

    /**
     * Creates the submission service.
     * @param repository persistence operations for ownership checks and idempotent inserts
     */
    public OrderSubmissionService(OrderSubmissionRepository repository) {
        this.repository = repository;
    }

    /**
     * Checks account ownership, resolves the instrument, and saves or reuses an order.
     * The request must already have passed Bean Validation.
     *
     * @param authenticatedUserId user identity from the validated JWT
     * @param request validated submission details and account-scoped retry key
     * @return the saved order and whether this call created it
     * @throws ResponseStatusException for missing authentication (401), an unknown or
     *         foreign account (404), or an unsupported/non-tradable symbol (400)
     * @throws IllegalStateException if a competing insert conflicts but its order cannot be read
     */
    @Transactional
    public OrderSubmissionResult submit(UUID authenticatedUserId, SubmitOrderRequest request) {
        if (authenticatedUserId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        }

        if (!repository.accountBelongsToUser(request.accountId(), authenticatedUserId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found");
        }

        var existing = repository.findByAccountAndClientReference(
                request.accountId(), request.clientReference());
        if (existing.isPresent()) {
            return new OrderSubmissionResult(existing.get(), false);
        }

        String symbol = request.normalizedSymbol();
        UUID instrumentId = repository.findTradableInstrumentIdBySymbol(symbol)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Unsupported or non-tradable symbol"));

        var saved = repository.insert(
                request.accountId(), instrumentId, symbol, request.clientReference(),
                request.normalizedSide(), request.quantity(),
                request.normalizedOrderType(), request.bufferPercent());
        // ON CONFLICT waits for the competing insert without aborting our transaction.
        // A separate SELECT sees that committed row under PostgreSQL READ COMMITTED.
        return saved.map(order -> new OrderSubmissionResult(order, true))
                .orElseGet(() -> repository.findByAccountAndClientReference(
                                request.accountId(), request.clientReference())
                        .map(order -> new OrderSubmissionResult(order, false))
                        .orElseThrow(() -> new IllegalStateException("Conflicting order is unavailable")));
    }
}
