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
    public OrderStatusHistory() {
    }

    public OrderStatusHistory(UUID statusHistoryId, Order order, String status, 
                             String reasonCode, String reasonText) {
        this.statusHistoryId = statusHistoryId;
        this.order = order;
        this.status = status;
        this.reasonCode = reasonCode;
        this.reasonText = reasonText;
    }

    // Getters and Setters
    public UUID getStatusHistoryId() {
        return statusHistoryId;
    }

    public void setStatusHistoryId(UUID statusHistoryId) {
        this.statusHistoryId = statusHistoryId;
    }

    public Order getOrder() {
        return order;
    }

    public void setOrder(Order order) {
        this.order = order;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getReasonCode() {
        return reasonCode;
    }

    public void setReasonCode(String reasonCode) {
        this.reasonCode = reasonCode;
    }

    public String getReasonText() {
        return reasonText;
    }

    public void setReasonText(String reasonText) {
        this.reasonText = reasonText;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public void setOccurredAt(Instant occurredAt) {
        this.occurredAt = occurredAt;
    }
}
