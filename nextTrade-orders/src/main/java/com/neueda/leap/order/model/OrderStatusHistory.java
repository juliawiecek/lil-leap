package com.neueda.leap.order.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * OrderStatusHistory entity for audit trail of order status changes.
 * BR-07, BR-16: Append-only history of all status changes with reasons.
 * Enables order status visibility and compliance audit trail.
 */
@Entity
@Table(name = "order_status_history", indexes = {
    @Index(name = "idx_status_history_order", columnList = "order_id"),
    @Index(name = "idx_status_history_occurred_at", columnList = "occurred_at DESC")
})
public class OrderStatusHistory {
    
    @Id
    @Column(columnDefinition = "uuid")
    private UUID statusHistoryId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;
    
    @Column(name = "status", nullable = false, length = 20)
    private String status;
    
    @Column(name = "reason_code", length = 50)
    private String reasonCode;
    
    @Column(name = "reason_text", columnDefinition = "TEXT")
    private String reasonText;
    
    @CreationTimestamp
    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    // Constructors
    /**
     * Creates an empty entity for JPA hydration or application initialization.
     */
    public OrderStatusHistory() {
    }

    /**
     * Creates a {@code OrderStatusHistory} with the supplied initial values.
     *
     * @param statusHistoryId status history id
     * @param order order being executed
     * @param status persisted order lifecycle status
     * @param reasonCode machine-readable outcome code
     * @param reasonText human-readable outcome explanation
     */
    public OrderStatusHistory(UUID statusHistoryId, Order order, String status, 
                             String reasonCode, String reasonText) {
        this.statusHistoryId = statusHistoryId;
        this.order = order;
        this.status = status;
        this.reasonCode = reasonCode;
        this.reasonText = reasonText;
    }

    // Getters and Setters
    /**
     * Returns status history id.
     *
     * @return status history id
     */
    public UUID getStatusHistoryId() {
        return statusHistoryId;
    }

    /**
     * Sets status history id.
     *
     * @param statusHistoryId status history id
     */
    public void setStatusHistoryId(UUID statusHistoryId) {
        this.statusHistoryId = statusHistoryId;
    }

    /**
     * Returns order being executed.
     *
     * @return order being executed
     */
    public Order getOrder() {
        return order;
    }

    /**
     * Sets order being executed.
     *
     * @param order order being executed
     */
    public void setOrder(Order order) {
        this.order = order;
    }

    /**
     * Returns persisted order lifecycle status.
     *
     * @return persisted order lifecycle status
     */
    public String getStatus() {
        return status;
    }

    /**
     * Sets persisted order lifecycle status.
     *
     * @param status persisted order lifecycle status
     */
    public void setStatus(String status) {
        this.status = status;
    }

    /**
     * Returns machine-readable outcome code.
     *
     * @return machine-readable outcome code
     */
    public String getReasonCode() {
        return reasonCode;
    }

    /**
     * Sets machine-readable outcome code.
     *
     * @param reasonCode machine-readable outcome code
     */
    public void setReasonCode(String reasonCode) {
        this.reasonCode = reasonCode;
    }

    /**
     * Returns human-readable outcome explanation.
     *
     * @return human-readable outcome explanation
     */
    public String getReasonText() {
        return reasonText;
    }

    /**
     * Sets human-readable outcome explanation.
     *
     * @param reasonText human-readable outcome explanation
     */
    public void setReasonText(String reasonText) {
        this.reasonText = reasonText;
    }

    /**
     * Returns timestamp of the status event.
     *
     * @return timestamp of the status event
     */
    public Instant getOccurredAt() {
        return occurredAt;
    }

    /**
     * Sets timestamp of the status event.
     *
     * @param occurredAt timestamp of the status event
     */
    public void setOccurredAt(Instant occurredAt) {
        this.occurredAt = occurredAt;
    }
}
