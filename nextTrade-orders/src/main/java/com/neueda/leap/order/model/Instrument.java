package com.neueda.leap.order.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * Instrument entity representing a tradeable security.
 * Supports COMMON_STOCK, FX, and CRYPTO asset classes.
 */
@Entity
@Table(name = "instruments")
public class Instrument {
    
    @Id
    @Column(columnDefinition = "uuid")
    private UUID instrumentId;
    
    @Column(name = "symbol", nullable = false, unique = true, length = 20)
    private String symbol;
    
    @Column(name = "name", nullable = false, length = 255)
    private String name;
    
    @Column(name = "asset_class", nullable = false, length = 30)
    private String assetClass;  // COMMON_STOCK, FX, CRYPTO
    
    @Column(name = "currency", nullable = false, length = 3)
    private String currency;
    
    @Column(name = "market", nullable = false, length = 30)
    private String market;
    
    @Column(name = "is_active", nullable = false)
    private Boolean isActive;
    
    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    // Constructors
    /**
     * Creates an empty entity for JPA hydration or application initialization.
     */
    public Instrument() {
    }

    /**
     * Creates a {@code Instrument} with the supplied initial values.
     *
     * @param instrumentId persistent instrument identifier
     * @param symbol instrument trading symbol
     * @param name name
     * @param assetClass instrument asset class
     * @param currency currency code
     * @param market market identifier
     * @param isActive whether the instrument is active
     */
    public Instrument(UUID instrumentId, String symbol, String name, String assetClass, 
                     String currency, String market, Boolean isActive) {
        this.instrumentId = instrumentId;
        this.symbol = symbol;
        this.name = name;
        this.assetClass = assetClass;
        this.currency = currency;
        this.market = market;
        this.isActive = isActive;
    }

    // Getters and Setters
    /**
     * Returns persistent instrument identifier.
     *
     * @return persistent instrument identifier
     */
    public UUID getInstrumentId() {
        return instrumentId;
    }

    /**
     * Sets persistent instrument identifier.
     *
     * @param instrumentId persistent instrument identifier
     */
    public void setInstrumentId(UUID instrumentId) {
        this.instrumentId = instrumentId;
    }

    /**
     * Returns instrument trading symbol.
     *
     * @return instrument trading symbol
     */
    public String getSymbol() {
        return symbol;
    }

    /**
     * Sets instrument trading symbol.
     *
     * @param symbol instrument trading symbol
     */
    public void setSymbol(String symbol) {
        this.symbol = symbol;
    }

    /**
     * Returns name.
     *
     * @return name
     */
    public String getName() {
        return name;
    }

    /**
     * Sets name.
     *
     * @param name name
     */
    public void setName(String name) {
        this.name = name;
    }

    /**
     * Returns instrument asset class.
     *
     * @return instrument asset class
     */
    public String getAssetClass() {
        return assetClass;
    }

    /**
     * Sets instrument asset class.
     *
     * @param assetClass instrument asset class
     */
    public void setAssetClass(String assetClass) {
        this.assetClass = assetClass;
    }

    /**
     * Returns currency code.
     *
     * @return currency code
     */
    public String getCurrency() {
        return currency;
    }

    /**
     * Sets currency code.
     *
     * @param currency currency code
     */
    public void setCurrency(String currency) {
        this.currency = currency;
    }

    /**
     * Returns market identifier.
     *
     * @return market identifier
     */
    public String getMarket() {
        return market;
    }

    /**
     * Sets market identifier.
     *
     * @param market market identifier
     */
    public void setMarket(String market) {
        this.market = market;
    }

    /**
     * Returns whether the instrument is active.
     *
     * @return whether the instrument is active
     */
    public Boolean getIsActive() {
        return isActive;
    }

    /**
     * Sets whether the instrument is active.
     *
     * @param isActive whether the instrument is active
     */
    public void setIsActive(Boolean isActive) {
        this.isActive = isActive;
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
}
