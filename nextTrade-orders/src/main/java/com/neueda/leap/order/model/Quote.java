package com.neueda.leap.order.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Quote entity representing a market quote for a security.
 * BR-08: Non-stale quotes used for order execution pricing.
 * BR-13: Quotes provide indicative bid/ask prices for order display.
 */
@Entity
@Table(name = "quotes", uniqueConstraints = {
    @UniqueConstraint(name = "uk_quotes_instrument_quoted_at_source",
                     columnNames = {"instrument_id", "quoted_at", "source"})
}, indexes = {
    @Index(name = "idx_quotes_instrument", columnList = "instrument_id"),
    @Index(name = "idx_quotes_quoted_at", columnList = "quoted_at DESC"),
    @Index(name = "idx_quotes_instrument_latest", columnList = "instrument_id, quoted_at DESC")
})
public class Quote {
    
    @Id
    @Column(columnDefinition = "uuid")
    private UUID quoteId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "instrument_id", nullable = false)
    private Instrument instrument;
    
    @Column(name = "bid", nullable = false, precision = 18, scale = 8)
    private BigDecimal bid;
    
    @Column(name = "ask", nullable = false, precision = 18, scale = 8)
    private BigDecimal ask;
    
    @Column(name = "bid_size")
    private Long bidSize;
    
    @Column(name = "ask_size")
    private Long askSize;
    
    @Column(name = "quoted_at", nullable = false)
    private Instant quotedAt;
    
    @Column(name = "source", nullable = false, length = 50)
    private String source;
    
    @Column(name = "is_synthetic", nullable = false)
    private Boolean isSynthetic;
    
    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    // Constructors
    public Quote() {
    }

    public Quote(UUID quoteId, Instrument instrument, BigDecimal bid, BigDecimal ask,
                 Instant quotedAt, String source, Boolean isSynthetic) {
        this.quoteId = quoteId;
        this.instrument = instrument;
        this.bid = bid;
        this.ask = ask;
        this.quotedAt = quotedAt;
        this.source = source;
        this.isSynthetic = isSynthetic;
    }

    // Getters and Setters
    public UUID getQuoteId() {
        return quoteId;
    }

    public void setQuoteId(UUID quoteId) {
        this.quoteId = quoteId;
    }

    public Instrument getInstrument() {
        return instrument;
    }

    public void setInstrument(Instrument instrument) {
        this.instrument = instrument;
    }

    public BigDecimal getBid() {
        return bid;
    }

    public void setBid(BigDecimal bid) {
        this.bid = bid;
    }

    public BigDecimal getAsk() {
        return ask;
    }

    public void setAsk(BigDecimal ask) {
        this.ask = ask;
    }

    public Long getBidSize() {
        return bidSize;
    }

    public void setBidSize(Long bidSize) {
        this.bidSize = bidSize;
    }

    public Long getAskSize() {
        return askSize;
    }

    public void setAskSize(Long askSize) {
        this.askSize = askSize;
    }

    public Instant getQuotedAt() {
        return quotedAt;
    }

    public void setQuotedAt(Instant quotedAt) {
        this.quotedAt = quotedAt;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public Boolean getIsSynthetic() {
        return isSynthetic;
    }

    public void setIsSynthetic(Boolean isSynthetic) {
        this.isSynthetic = isSynthetic;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
    
    /**
     * Calculate the midpoint price between bid and ask.
     */
    public BigDecimal getMidpoint() {
        return bid.add(ask).divide(new BigDecimal("2"), 8, java.math.RoundingMode.HALF_UP);
    }
}
