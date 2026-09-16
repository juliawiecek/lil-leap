package com.neueda.leap.order.submission.service;

import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.OrderSubmissionRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Service
public class OrderSubmissionService {

    private final OrderSubmissionRepository repository;

    public OrderSubmissionService(OrderSubmissionRepository repository) {
        this.repository = repository;
    }

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
