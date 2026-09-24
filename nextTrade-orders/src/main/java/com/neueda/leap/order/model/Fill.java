package com.neueda.leap.order.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Fill entity representing the execution of an order against a market quote.
 * BR-02, BR-06: One fill per order in MVP (no partial fills).
 * Quote timestamp proves price was current at execution time (staleness proof).
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
    public Fill() {
    }

    public Fill(UUID fillId, Order order, Long filledQuantity, BigDecimal executionPrice, Instant quoteTimestamp) {
        this.fillId = fillId;
        this.order = order;
        this.filledQuantity = filledQuantity;
        this.executionPrice = executionPrice;
        this.quoteTimestamp = quoteTimestamp;
    }

    public Fill(UUID fillId, Order order, Long filledQuantity, BigDecimal executionPrice, Instant quoteTimestamp, Quote quote) {
        this.fillId = fillId;
        this.order = order;
        this.filledQuantity = filledQuantity;
        this.executionPrice = executionPrice;
        this.quoteTimestamp = quoteTimestamp;
        this.quote = quote;
    }

    // Getters and Setters
    public UUID getFillId() {
        return fillId;
    }

    public void setFillId(UUID fillId) {
        this.fillId = fillId;
    }

    public Order getOrder() {
        return order;
    }

    public void setOrder(Order order) {
        this.order = order;
    }

    public Long getFilledQuantity() {
        return filledQuantity;
    }

    public void setFilledQuantity(Long filledQuantity) {
        this.filledQuantity = filledQuantity;
    }

    public BigDecimal getExecutionPrice() {
        return executionPrice;
    }

    public void setExecutionPrice(BigDecimal executionPrice) {
        this.executionPrice = executionPrice;
    }

    public Instant getQuoteTimestamp() {
        return quoteTimestamp;
    }

    public void setQuoteTimestamp(Instant quoteTimestamp) {
        this.quoteTimestamp = quoteTimestamp;
    }

    public Instant getFilledAt() {
        return filledAt;
    }

    public void setFilledAt(Instant filledAt) {
        this.filledAt = filledAt;
    }

    public Quote getQuote() {
        return quote;
    }

    public void setQuote(Quote quote) {
        this.quote = quote;
    }
}
