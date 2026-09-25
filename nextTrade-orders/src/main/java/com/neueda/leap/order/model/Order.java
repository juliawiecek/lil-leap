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
    /**
     * Creates an empty entity for JPA hydration or application initialization.
     */
    public Order() {
    }

    /**
     * Creates a {@code Order} with the supplied initial values.
     *
     * @param orderId persistent order identifier
     * @param account account owning the trade
     * @param instrument instrument being traded
     * @param clientReference caller-supplied idempotency key, scoped to the account
     * @param side order side, BUY or SELL
     * @param quantity number of units in the order
     * @param orderType order type, such as MARKET
     * @param status persisted order lifecycle status
     */
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
    /**
     * Returns persistent order identifier.
     *
     * @return persistent order identifier
     */
    public UUID getOrderId() {
        return orderId;
    }

    /**
     * Sets persistent order identifier.
     *
     * @param orderId persistent order identifier
     */
    public void setOrderId(UUID orderId) {
        this.orderId = orderId;
    }

    /**
     * Returns account owning the trade.
     *
     * @return account owning the trade
     */
    public Account getAccount() {
        return account;
    }

    /**
     * Sets account owning the trade.
     *
     * @param account account owning the trade
     */
    public void setAccount(Account account) {
        this.account = account;
    }

    /**
     * Returns the instrument associated with this entity.
     * @return associated instrument
     */
    public Instrument getInstrument() {
        return instrument;
    }

    /**
     * Sets instrument being traded.
     *
     * @param instrument instrument being traded
     */
    public void setInstrument(Instrument instrument) {
        this.instrument = instrument;
    }

    /**
     * Returns caller-supplied idempotency key, scoped to the account.
     *
     * @return caller-supplied idempotency key, scoped to the account
     */
    public UUID getClientReference() {
        return clientReference;
    }

    /**
     * Sets caller-supplied idempotency key, scoped to the account.
     *
     * @param clientReference caller-supplied idempotency key, scoped to the account
     */
    public void setClientReference(UUID clientReference) {
        this.clientReference = clientReference;
    }

    /**
     * Returns order side, BUY or SELL.
     *
     * @return order side, BUY or SELL
     */
    public String getSide() {
        return side;
    }

    /**
     * Sets order side, BUY or SELL.
     *
     * @param side order side, BUY or SELL
     */
    public void setSide(String side) {
        this.side = side;
    }

    /**
     * Returns number of units in the order.
     *
     * @return number of units in the order
     */
    public Long getQuantity() {
        return quantity;
    }

    /**
     * Sets number of units in the order.
     *
     * @param quantity number of units in the order
     */
    public void setQuantity(Long quantity) {
        this.quantity = quantity;
    }

    /**
     * Returns order type, such as MARKET.
     *
     * @return order type, such as MARKET
     */
    public String getOrderType() {
        return orderType;
    }

    /**
     * Sets order type, such as MARKET.
     *
     * @param orderType order type, such as MARKET
     */
    public void setOrderType(String orderType) {
        this.orderType = orderType;
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
     * Returns submission timestamp.
     *
     * @return submission timestamp
     */
    public Instant getSubmittedAt() {
        return submittedAt;
    }

    /**
     * Sets submission timestamp.
     *
     * @param submittedAt submission timestamp
     */
    public void setSubmittedAt(Instant submittedAt) {
        this.submittedAt = submittedAt;
    }

    /**
     * Returns acceptance timestamp, or null before acceptance.
     *
     * @return acceptance timestamp, or null before acceptance
     */
    public Instant getAcceptedAt() {
        return acceptedAt;
    }

    /**
     * Sets acceptance timestamp, or null before acceptance.
     *
     * @param acceptedAt acceptance timestamp, or null before acceptance
     */
    public void setAcceptedAt(Instant acceptedAt) {
        this.acceptedAt = acceptedAt;
    }

    /**
     * Returns earliest time for the next execution attempt.
     *
     * @return earliest time for the next execution attempt
     */
    public Instant getNextExecutionAt() {
        return nextExecutionAt;
    }

    /**
     * Sets earliest time for the next execution attempt.
     *
     * @param nextExecutionAt earliest time for the next execution attempt
     */
    public void setNextExecutionAt(Instant nextExecutionAt) {
        this.nextExecutionAt = nextExecutionAt;
    }

    /**
     * Returns recorded execution attempt count.
     *
     * @return recorded execution attempt count
     */
    public Long getExecutionAttempts() {
        return executionAttempts;
    }

    /**
     * Sets recorded execution attempt count.
     *
     * @param executionAttempts recorded execution attempt count
     */
    public void setExecutionAttempts(Long executionAttempts) {
        this.executionAttempts = executionAttempts;
    }

    /**
     * Returns most recent execution error code, or null when cleared.
     *
     * @return most recent execution error code, or null when cleared
     */
    public String getLastExecutionError() {
        return lastExecutionError;
    }

    /**
     * Sets most recent execution error code, or null when cleared.
     *
     * @param lastExecutionError most recent execution error code, or null when cleared
     */
    public void setLastExecutionError(String lastExecutionError) {
        this.lastExecutionError = lastExecutionError;
    }

    /**
     * Returns last update timestamp.
     *
     * @return last update timestamp
     */
    public Instant getUpdatedAt() {
        return updatedAt;
    }

    /**
     * Sets last update timestamp.
     *
     * @param updatedAt last update timestamp
     */
    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    /**
     * Returns order-specific execution tolerance percentage, or null to use the account default.
     *
     * @return order-specific execution tolerance percentage, or null to use the account default
     */
    public BigDecimal getBufferPercent() {
        return bufferPercent;
    }

    /**
     * Sets order-specific execution tolerance percentage, or null to use the account default.
     *
     * @param bufferPercent order-specific execution tolerance percentage, or null to use the account default
     */
    public void setBufferPercent(BigDecimal bufferPercent) {
        this.bufferPercent = bufferPercent;
    }
}
