package com.neueda.leap.order.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Order entity representing a market order for trading securities.
 * BR-04, BR-06, BR-07: Order submission with 2-phase commitment (SUBMITTED → ACCEPTED → FILLED/REJECTED).
 * BR-16: Idempotency via client_reference prevents duplicate fills on retry.
 */
@Entity
@Table(name = "orders", uniqueConstraints = {
    @UniqueConstraint(name = "uk_orders_account_client_reference", 
                     columnNames = {"account_id", "client_reference"})
})
public class Order {
    
    @Id
    @Column(columnDefinition = "uuid")
    private UUID orderId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "instrument_id", nullable = false)
    private Instrument instrument;
    
    @Column(name = "client_reference", nullable = false, columnDefinition = "uuid")
    private UUID clientReference;
    
    @Column(name = "side", nullable = false, length = 10)
    private String side;  // BUY or SELL
    
    @Column(name = "quantity", nullable = false)
    private Long quantity;
    
    @Column(name = "order_type", nullable = false, length = 20)
    private String orderType;  // MARKET
    
    @Column(name = "status", nullable = false, length = 20)
    private String status;  // SUBMITTED, ACCEPTED, FILLED, REJECTED, PENDING, DELAYED
    
    @CreationTimestamp
    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt;
    
    @Column(name = "accepted_at")
    private Instant acceptedAt;
    
    @Column(name = "next_execution_at", nullable = false)
    private Instant nextExecutionAt;
    
    @Column(name = "execution_attempts", nullable = false)
    private Long executionAttempts;
    
    @Column(name = "last_execution_error", length = 50)
    private String lastExecutionError;
    
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    
    @Column(name = "buffer_percent", precision = 5, scale = 2)
    private BigDecimal bufferPercent;

    // Constructors
    public Order() {
    }

    public Order(UUID orderId, Account account, Instrument instrument, UUID clientReference,
                 String side, Long quantity, String orderType, String status) {
        this.orderId = orderId;
        this.account = account;
        this.instrument = instrument;
        this.clientReference = clientReference;
        this.side = side;
        this.quantity = quantity;
        this.orderType = orderType;
        this.status = status;
        this.executionAttempts = 0L;
        this.nextExecutionAt = Instant.now();
    }

    // Getters and Setters
    public UUID getOrderId() {
        return orderId;
    }

    public void setOrderId(UUID orderId) {
        this.orderId = orderId;
    }

    public Account getAccount() {
        return account;
    }

    public void setAccount(Account account) {
        this.account = account;
    }

    public Instrument getInstrument() {
        return instrument;
    }

    public void setInstrument(Instrument instrument) {
        this.instrument = instrument;
    }

    public UUID getClientReference() {
        return clientReference;
    }

    public void setClientReference(UUID clientReference) {
        this.clientReference = clientReference;
    }

    public String getSide() {
        return side;
    }

    public void setSide(String side) {
        this.side = side;
    }

    public Long getQuantity() {
        return quantity;
    }

    public void setQuantity(Long quantity) {
        this.quantity = quantity;
    }

    public String getOrderType() {
        return orderType;
    }

    public void setOrderType(String orderType) {
        this.orderType = orderType;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public void setSubmittedAt(Instant submittedAt) {
        this.submittedAt = submittedAt;
    }

    public Instant getAcceptedAt() {
        return acceptedAt;
    }

    public void setAcceptedAt(Instant acceptedAt) {
        this.acceptedAt = acceptedAt;
    }

    public Instant getNextExecutionAt() {
        return nextExecutionAt;
    }

    public void setNextExecutionAt(Instant nextExecutionAt) {
        this.nextExecutionAt = nextExecutionAt;
    }

    public Long getExecutionAttempts() {
        return executionAttempts;
    }

    public void setExecutionAttempts(Long executionAttempts) {
        this.executionAttempts = executionAttempts;
    }

    public String getLastExecutionError() {
        return lastExecutionError;
    }

    public void setLastExecutionError(String lastExecutionError) {
        this.lastExecutionError = lastExecutionError;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public BigDecimal getBufferPercent() {
        return bufferPercent;
    }

    public void setBufferPercent(BigDecimal bufferPercent) {
        this.bufferPercent = bufferPercent;
    }
}
