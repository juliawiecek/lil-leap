package com.neueda.leap.order.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * Immutable audit log entity mapping to PostgreSQL audit_log table.
 *
 * <p>Records every significant order event for compliance and reconstruction:
 * ORDER_ACCEPTED, PRICE_DECISION, ORDER_FILLED, ORDER_REJECTED, ORDER_REQUEUED,
 * SETTLEMENT_COMPLETED, SETTLEMENT_FAILED.</p>
 *
 * <p>Append-only; no update or delete methods. Runtime application role
 * has INSERT and SELECT only; UPDATE and DELETE are forbidden at the
 * database level.</p>
 */
@Entity
@Table(name = "audit_log")
public class AuditLog {

    @Id
    @Column(name = "audit_id", columnDefinition = "uuid")
    private UUID auditId;

    @Column(name = "user_id", columnDefinition = "uuid")
    private UUID userId;

    @Column(name = "account_id", columnDefinition = "uuid")
    private UUID accountId;

    @Column(name = "related_order_id", columnDefinition = "uuid")
    private UUID relatedOrderId;

    @Column(name = "actor_type", nullable = false, length = 20)
    private String actorType;  // 'USER' or 'SYSTEM'

    @Column(name = "event_type", nullable = false, length = 100)
    private String eventType;

    @Column(name = "payload", columnDefinition = "jsonb")
    private String payload;  // JSON-serialized object

    @Column(name = "created_at", nullable = false, columnDefinition = "timestamptz")
    private Instant createdAt;

    /**
     * Constructor for new audit events (all fields required except for nullable FKs).
     *
     * @param auditId unique audit event identifier (must be UUID.randomUUID())
     * @param userId authenticated user, or null for SYSTEM events
     * @param accountId account identifier if applicable, or null
     * @param relatedOrderId order identifier if applicable, or null
     * @param actorType 'USER' for authenticated client, 'SYSTEM' for background
     * @param eventType machine-readable event type (ORDER_ACCEPTED, etc.)
     * @param payload JSON-serialized event details
     * @param createdAt event timestamp (typically Instant.now())
     */
    public AuditLog(UUID auditId, UUID userId, UUID accountId, UUID relatedOrderId,
                    String actorType, String eventType, String payload, Instant createdAt) {
        this.auditId = auditId;
        this.userId = userId;
        this.accountId = accountId;
        this.relatedOrderId = relatedOrderId;
        this.actorType = actorType;
        this.eventType = eventType;
        this.payload = payload;
        this.createdAt = createdAt;
    }

    /** JPA no-arg constructor. */
    public AuditLog() {
    }

    public UUID getAuditId() {
        return auditId;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getAccountId() {
        return accountId;
    }

    public UUID getRelatedOrderId() {
        return relatedOrderId;
    }

    public String getActorType() {
        return actorType;
    }

    public String getEventType() {
        return eventType;
    }

    public String getPayload() {
        return payload;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    @Override
    public String toString() {
        return "AuditLog{" +
                "auditId=" + auditId +
                ", userId=" + userId +
                ", accountId=" + accountId +
                ", relatedOrderId=" + relatedOrderId +
                ", actorType='" + actorType + '\'' +
                ", eventType='" + eventType + '\'' +
                ", createdAt=" + createdAt +
                '}';
    }
}
