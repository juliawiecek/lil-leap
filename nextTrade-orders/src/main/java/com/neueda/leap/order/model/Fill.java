package com.neueda.leap.order.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Fill entity representing the execution of an order against a market quote.
 * BR-02, BR-06: One fill per order in MVP (no partial fills).
 * Quote identity and timestamp retain pricing evidence; freshness is checked by the execution service.
 * BR-09: Fills trigger settlement ledger entries (holding movements and cash transactions).
 */
@Entity
@Table(name = "fills", uniqueConstraints = {
    @UniqueConstraint(name = "uk_fills_order", columnNames = "order_id")
})
public class Fill {
    
    @Id
    @Column(columnDefinition = "uuid")
    private UUID fillId;
    
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;
    
    @Column(name = "filled_quantity", nullable = false)
    private Long filledQuantity;
    
    @Column(name = "execution_price", nullable = false, precision = 18, scale = 8)
    private BigDecimal executionPrice;
    
    @Column(name = "quote_timestamp", nullable = false)
    private Instant quoteTimestamp;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "quote_id", nullable = false)
    private Quote quote;
    
    @CreationTimestamp
    @Column(name = "filled_at", nullable = false)
    private Instant filledAt;

    // Constructors
    /**
     * Creates an empty entity for JPA hydration or application initialization.
     */
    public Fill() {
    }

    /**
     * Creates a {@code Fill} with the supplied initial values.
     *
     * @param fillId persistent fill identifier
     * @param order order being executed
     * @param filledQuantity filled quantity
     * @param executionPrice execution price per unit
     * @param quoteTimestamp timestamp of the source market quote
     */
    public Fill(UUID fillId, Order order, Long filledQuantity, BigDecimal executionPrice, Instant quoteTimestamp) {
        this.fillId = fillId;
        this.order = order;
        this.filledQuantity = filledQuantity;
        this.executionPrice = executionPrice;
        this.quoteTimestamp = quoteTimestamp;
    }

    /**
     * Creates a {@code Fill} with the supplied initial values.
     *
     * @param fillId persistent fill identifier
     * @param order order being executed
     * @param filledQuantity filled quantity
     * @param executionPrice execution price per unit
     * @param quoteTimestamp timestamp of the source market quote
     * @param quote source quote associated with the fill
     */
    public Fill(UUID fillId, Order order, Long filledQuantity, BigDecimal executionPrice, Instant quoteTimestamp, Quote quote) {
        this.fillId = fillId;
        this.order = order;
        this.filledQuantity = filledQuantity;
        this.executionPrice = executionPrice;
        this.quoteTimestamp = quoteTimestamp;
        this.quote = quote;
    }

    // Getters and Setters
    /**
     * Returns fill id.
     *
     * @return fill id
     */
    public UUID getFillId() {
        return fillId;
    }

    /**
     * Sets fill id.
     *
     * @param fillId persistent fill identifier
     */
    public void setFillId(UUID fillId) {
        this.fillId = fillId;
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
     * Returns filled quantity.
     *
     * @return filled quantity
     */
    public Long getFilledQuantity() {
        return filledQuantity;
    }

    /**
     * Sets filled quantity.
     *
     * @param filledQuantity filled quantity
     */
    public void setFilledQuantity(Long filledQuantity) {
        this.filledQuantity = filledQuantity;
    }

    /**
     * Returns the execution price per unit.
     * @return execution price per unit
     */
    public BigDecimal getExecutionPrice() {
        return executionPrice;
    }

    /**
     * Sets execution price per unit.
     *
     * @param executionPrice execution price per unit
     */
    public void setExecutionPrice(BigDecimal executionPrice) {
        this.executionPrice = executionPrice;
    }

    /**
     * Returns quote timestamp.
     *
     * @return quote timestamp
     */
    public Instant getQuoteTimestamp() {
        return quoteTimestamp;
    }

    /**
     * Sets quote timestamp.
     *
     * @param quoteTimestamp timestamp of the source market quote
     */
    public void setQuoteTimestamp(Instant quoteTimestamp) {
        this.quoteTimestamp = quoteTimestamp;
    }

    /**
     * Returns filled at.
     *
     * @return filled at
     */
    public Instant getFilledAt() {
        return filledAt;
    }

    /**
     * Sets filled at.
     *
     * @param filledAt filled at
     */
    public void setFilledAt(Instant filledAt) {
        this.filledAt = filledAt;
    }

    /**
     * Returns source quote associated with the fill.
     *
     * @return source quote associated with the fill
     */
    public Quote getQuote() {
        return quote;
    }

    /**
     * Sets source quote associated with the fill.
     *
     * @param quote source quote associated with the fill
     */
    public void setQuote(Quote quote) {
        this.quote = quote;
    }
}
