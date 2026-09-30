package com.neueda.leap.order.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.neueda.leap.order.model.AuditLog;
import com.neueda.leap.order.repository.AuditLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Internal audit event writer. Records significant order lifecycle events
 * (ORDER_ACCEPTED, PRICE_DECISION, ORDER_FILLED, ORDER_REJECTED, ORDER_REQUEUED,
 * SETTLEMENT_COMPLETED) into the audit_log table.
 *
 * <p>Usage: This is an internal service used only by order submission, execution,
 * and settlement flows. Do not expose this via public API endpoints.
 * Audit writes participate in the same transaction as the related business writes
 * (order save, fill creation, settlement ledger writes) so they roll back together
 * on failure.</p>
 *
 * <p>Idempotency: Callers must verify that a terminal event does not already
 * exist before calling the write method. This service does not enforce uniqueness
 * but relies on the caller's pre-check for terminal events.</p>
 */
@Service
class AuditEventWriter {

    private static final Logger log = LoggerFactory.getLogger(AuditEventWriter.class);

    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;

    /**
     * Event type constants.
     */
    public static final String EVENT_ORDER_ACCEPTED = "ORDER_ACCEPTED";
    public static final String EVENT_PRICE_DECISION = "PRICE_DECISION";
    public static final String EVENT_ORDER_FILLED = "ORDER_FILLED";
    public static final String EVENT_ORDER_REJECTED = "ORDER_REJECTED";
    public static final String EVENT_ORDER_REQUEUED = "ORDER_REQUEUED";
    public static final String EVENT_SETTLEMENT_COMPLETED = "SETTLEMENT_COMPLETED";
    public static final String EVENT_SETTLEMENT_FAILED = "SETTLEMENT_FAILED";

    /**
     * Actor type constants.
     */
    public static final String ACTOR_USER = "USER";
    public static final String ACTOR_SYSTEM = "SYSTEM";

    public AuditEventWriter(AuditLogRepository auditLogRepository, ObjectMapper objectMapper) {
        this.auditLogRepository = auditLogRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * Write an ORDER_ACCEPTED event.
     *
     * Called in the same transaction as the order is persisted.
     * Idempotency: Check that no ORDER_ACCEPTED event exists for this order before calling.
     *
     * @param userId authenticated user who submitted the order
     * @param accountId account the order is for
     * @param orderId order identifier
     * @param payload event details (orderId, accountId, instrumentId, side, quantity, etc.)
     */
    public void writeOrderAccepted(UUID userId, UUID accountId, UUID orderId, Map<String, Object> payload) {
        // Idempotency check: if ORDER_ACCEPTED already exists, skip (already written for this order)
        if (hasTerminalEventForOrder(orderId, EVENT_ORDER_ACCEPTED)) {
            log.debug("ORDER_ACCEPTED already exists for order {}; skipping duplicate", orderId);
            return;
        }
        write(userId, accountId, orderId, ACTOR_USER, EVENT_ORDER_ACCEPTED, payload);
    }

    /**
     * Write a PRICE_DECISION event.
     *
     * Called when a pricing decision is made during execution. Includes quote evidence.
     * Multiple PRICE_DECISION events may exist for one order (retries with different quotes).
     *
     * @param accountId account the order is for
     * @param orderId order identifier
     * @param payload event details (quoteId, quotedAt, bid, ask, executionPrice, freshness, etc.)
     */
    public void writePriceDecision(UUID accountId, UUID orderId, Map<String, Object> payload) {
        write(null, accountId, orderId, ACTOR_SYSTEM, EVENT_PRICE_DECISION, payload);
    }

    /**
     * Write an ORDER_FILLED event.
     *
     * Called in the same transaction as the fill and settlement ledger writes.
     * Idempotency: Check that no ORDER_FILLED event exists for this order before calling.
     *
     * @param accountId account the order is for
     * @param orderId order identifier
     * @param payload event details (fillId, quantity, executionPrice, quoteTimestamp, etc.)
     */
    public void writeOrderFilled(UUID accountId, UUID orderId, Map<String, Object> payload) {
        // Idempotency check: if ORDER_FILLED already exists, skip (already written for this order)
        if (hasTerminalEventForOrder(orderId, EVENT_ORDER_FILLED)) {
            log.debug("ORDER_FILLED already exists for order {}; skipping duplicate", orderId);
            return;
        }
        write(null, accountId, orderId, ACTOR_SYSTEM, EVENT_ORDER_FILLED, payload);
    }

    /**
     * Write an ORDER_REJECTED event.
     *
     * Called when an order is rejected after exceeding max retry attempts or failing validation.
     * Idempotency: Check that no ORDER_REJECTED event exists for this order before calling.
     *
     * @param accountId account the order is for
     * @param orderId order identifier
     * @param payload event details (reasonCode, attemptNumber, quote evidence if available, etc.)
     */
    public void writeOrderRejected(UUID accountId, UUID orderId, Map<String, Object> payload) {
        // Idempotency check: if ORDER_REJECTED already exists, skip (already written for this order)
        if (hasTerminalEventForOrder(orderId, EVENT_ORDER_REJECTED)) {
            log.debug("ORDER_REJECTED already exists for order {}; skipping duplicate", orderId);
            return;
        }
        write(null, accountId, orderId, ACTOR_SYSTEM, EVENT_ORDER_REJECTED, payload);
    }

    /**
     * Write an ORDER_REQUEUED event.
     *
     * Called when an order fails transiently and will be retried.
     * Multiple REQUEUED events may exist for one order as it is retried.
     *
     * @param accountId account the order is for
     * @param orderId order identifier
     * @param payload event details (attemptNumber, reasonCode, nextExecutionTime, quote if available, etc.)
     */
    public void writeOrderRequeued(UUID accountId, UUID orderId, Map<String, Object> payload) {
        write(null, accountId, orderId, ACTOR_SYSTEM, EVENT_ORDER_REQUEUED, payload);
    }

    /**
     * Write a SETTLEMENT_COMPLETED event.
     *
     * Called in the same transaction as holding_movements, cash_transactions,
     * cash_balances/holdings cache updates, order status, and status history.
     * All writes commit or roll back together.
     * Idempotency: Check that no SETTLEMENT_COMPLETED event exists for this order before calling.
     *
     * @param accountId account the settlement applies to
     * @param orderId order identifier
     * @param payload event details (fillId, quantity, cashDelta, holdingDelta, timestamp, etc.)
     */
    public void writeSettlementCompleted(UUID accountId, UUID orderId, Map<String, Object> payload) {
        // Idempotency check: if SETTLEMENT_COMPLETED already exists, skip (already written for this order)
        if (hasTerminalEventForOrder(orderId, EVENT_SETTLEMENT_COMPLETED)) {
            log.debug("SETTLEMENT_COMPLETED already exists for order {}; skipping duplicate", orderId);
            return;
        }
        write(null, accountId, orderId, ACTOR_SYSTEM, EVENT_SETTLEMENT_COMPLETED, payload);
    }

    /**
     * Write a SETTLEMENT_FAILED event.
     *
     * Called ONLY when settlement fails and a durable failure record is needed.
     * This event is written only if a post-rollback failure-recording path exists.
     * Do not call this inside a transaction that is guaranteed to roll back.
     *
     * @param accountId account the settlement was for
     * @param orderId order identifier
     * @param payload event details (reason, attemptNumber, etc.)
     */
    public void writeSettlementFailed(UUID accountId, UUID orderId, Map<String, Object> payload) {
        write(null, accountId, orderId, ACTOR_SYSTEM, EVENT_SETTLEMENT_FAILED, payload);
    }

    /**
     * Internal method to write any audit event.
     *
     * Called within the same transaction as the related business write.
     * Converts payload to JSON string and persists an AuditLog entity.
     *
     * @param userId user identifier (null for SYSTEM events)
     * @param accountId account identifier (null for user-scoped events)
     * @param orderId order identifier (null for account-scoped events)
     * @param actorType 'USER' or 'SYSTEM'
     * @param eventType machine-readable event type
     * @param payload map of event details (will be JSON-serialized)
     */
    private void write(UUID userId, UUID accountId, UUID orderId, String actorType,
                      String eventType, Map<String, Object> payload) {
        try {
            String jsonPayload = objectMapper.writeValueAsString(payload != null ? payload : new HashMap<>());
            AuditLog event = new AuditLog(
                UUID.randomUUID(),
                userId,
                accountId,
                orderId,
                actorType,
                eventType,
                jsonPayload,
                Instant.now()
            );
            auditLogRepository.save(event);
            log.debug("Wrote audit event: type={}, order={}, account={}", eventType, orderId, accountId);
        } catch (Exception e) {
            // Audit write failure is critical; do not silently ignore
            log.error("Failed to write audit event: type={}, order={}", eventType, orderId, e);
            throw new IllegalStateException("Audit event write failed for " + eventType, e);
        }
    }

    /**
     * Check if a terminal event already exists for this order.
     *
     * Used for idempotency: prevents duplicate ORDER_ACCEPTED, ORDER_FILLED, ORDER_REJECTED,
     * or SETTLEMENT_COMPLETED events when a write is retried.
     *
     * @param orderId order identifier
     * @param eventType terminal event type (ORDER_ACCEPTED, ORDER_FILLED, ORDER_REJECTED, SETTLEMENT_COMPLETED)
     * @return true if a terminal event of this type already exists for this order
     */
    private boolean hasTerminalEventForOrder(UUID orderId, String eventType) {
        Optional<AuditLog> existing = auditLogRepository.findLatestTerminalEventForOrder(orderId, eventType);
        return existing.isPresent();
    }
}
