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
    /**
     * Creates an empty entity for JPA hydration or application initialization.
     */
    public Quote() {
    }

    /**
     * Creates a {@code Quote} with the supplied initial values.
     *
     * @param quoteId identifier of the source quote
     * @param instrument instrument being traded
     * @param bid bid price per unit
     * @param ask ask price per unit
     * @param quotedAt timestamp supplied by the quote source
     * @param source quote provider name
     * @param isSynthetic whether the quote was generated synthetically
     */
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
    /**
     * Returns identifier of the source quote.
     *
     * @return identifier of the source quote
     */
    public UUID getQuoteId() {
        return quoteId;
    }

    /**
     * Sets identifier of the source quote.
     *
     * @param quoteId identifier of the source quote
     */
    public void setQuoteId(UUID quoteId) {
        this.quoteId = quoteId;
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
     * Returns bid price per unit.
     *
     * @return bid price per unit
     */
    public BigDecimal getBid() {
        return bid;
    }

    /**
     * Sets bid price per unit.
     *
     * @param bid bid price per unit
     */
    public void setBid(BigDecimal bid) {
        this.bid = bid;
    }

    /**
     * Returns ask price per unit.
     *
     * @return ask price per unit
     */
    public BigDecimal getAsk() {
        return ask;
    }

    /**
     * Sets ask price per unit.
     *
     * @param ask ask price per unit
     */
    public void setAsk(BigDecimal ask) {
        this.ask = ask;
    }

    /**
     * Returns available bid quantity, or null when unspecified.
     *
     * @return available bid quantity, or null when unspecified
     */
    public Long getBidSize() {
        return bidSize;
    }

    /**
     * Sets available bid quantity, or null when unspecified.
     *
     * @param bidSize available bid quantity, or null when unspecified
     */
    public void setBidSize(Long bidSize) {
        this.bidSize = bidSize;
    }

    /**
     * Returns available ask quantity, or null when unspecified.
     *
     * @return available ask quantity, or null when unspecified
     */
    public Long getAskSize() {
        return askSize;
    }

    /**
     * Sets available ask quantity, or null when unspecified.
     *
     * @param askSize available ask quantity, or null when unspecified
     */
    public void setAskSize(Long askSize) {
        this.askSize = askSize;
    }

    /**
     * Returns timestamp supplied by the quote source.
     *
     * @return timestamp supplied by the quote source
     */
    public Instant getQuotedAt() {
        return quotedAt;
    }

    /**
     * Sets timestamp supplied by the quote source.
     *
     * @param quotedAt timestamp supplied by the quote source
     */
    public void setQuotedAt(Instant quotedAt) {
        this.quotedAt = quotedAt;
    }

    /**
     * Returns quote provider name.
     *
     * @return quote provider name
     */
    public String getSource() {
        return source;
    }

    /**
     * Sets quote provider name.
     *
     * @param source quote provider name
     */
    public void setSource(String source) {
        this.source = source;
    }

    /**
     * Returns whether the quote was generated synthetically.
     *
     * @return whether the quote was generated synthetically
     */
    public Boolean getIsSynthetic() {
        return isSynthetic;
    }

    /**
     * Sets whether the quote was generated synthetically.
     *
     * @param isSynthetic whether the quote was generated synthetically
     */
    public void setIsSynthetic(Boolean isSynthetic) {
        this.isSynthetic = isSynthetic;
    }

    /**
     * Returns row creation timestamp.
     *
     * @return row creation timestamp
     */
    public Instant getCreatedAt() {
        return createdAt;
    }

    /**
     * Sets row creation timestamp.
     *
     * @param createdAt row creation timestamp
     */
    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
    
    /**
     * Calculate the midpoint price between bid and ask.
     *
     * @return mean of bid and ask rounded to eight decimal places using HALF_UP
     */
    public BigDecimal getMidpoint() {
        return bid.add(ask).divide(new BigDecimal("2"), 8, java.math.RoundingMode.HALF_UP);
    }
}
