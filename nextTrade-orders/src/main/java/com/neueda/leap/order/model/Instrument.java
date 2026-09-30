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
    @Column(name = "instrument_id", columnDefinition = "uuid")
    private UUID instrumentId;
    
    @Column(name = "symbol", nullable = false, length = 20)
    private String symbol;
    
    @Column(name = "instrument_name", nullable = false, length = 200)
    private String instrumentName;
    
    @Column(name = "asset_class", nullable = false, length = 30)
    private String assetClass;  // COMMON_STOCK, FX, CRYPTO
    
    @Column(name = "market_code", nullable = false, length = 20)
    private String marketCode;
    
    @Column(name = "currency", nullable = false, length = 3)
    private String currency;
    
    @Column(name = "sector", nullable = true, length = 100)
    private String sector;
    
    @Column(name = "enabled", nullable = false)
    private Boolean enabled;
    
    @Column(name = "tradable", nullable = false)
    private Boolean tradable;
    
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
     * @param instrumentName display name of the instrument
     * @param assetClass instrument asset class (COMMON_STOCK, FX, CRYPTO)
     * @param marketCode market code
     * @param currency currency code
     * @param enabled whether the instrument is enabled for trading
     * @param tradable whether the instrument is tradable (vs halted/restricted)
     */
    public Instrument(UUID instrumentId, String symbol, String instrumentName, String assetClass, 
                     String marketCode, String currency, Boolean enabled, Boolean tradable) {
        this.instrumentId = instrumentId;
        this.symbol = symbol;
        this.instrumentName = instrumentName;
        this.assetClass = assetClass;
        this.marketCode = marketCode;
        this.currency = currency;
        this.enabled = enabled;
        this.tradable = tradable;
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
     * Returns display name of the instrument.
     *
     * @return instrument name
     */
    public String getInstrumentName() {
        return instrumentName;
    }

    /**
     * Sets display name of the instrument.
     *
     * @param instrumentName instrument name
     */
    public void setInstrumentName(String instrumentName) {
        this.instrumentName = instrumentName;
    }

    /**
     * Returns instrument asset class.
     *
     * @return instrument asset class (COMMON_STOCK, FX, CRYPTO)
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
     * Returns market code.
     *
     * @return market code
     */
    public String getMarketCode() {
        return marketCode;
    }

    /**
     * Sets market code.
     *
     * @param marketCode market code
     */
    public void setMarketCode(String marketCode) {
        this.marketCode = marketCode;
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
     * Returns industry sector classification.
     *
     * @return sector (nullable)
     */
    public String getSector() {
        return sector;
    }

    /**
     * Sets industry sector classification.
     *
     * @param sector sector
     */
    public void setSector(String sector) {
        this.sector = sector;
    }

    /**
     * Returns whether the instrument is enabled for trading.
     * NEXT-193 Rejection: enabled=false → INSTRUMENT_DISABLED
     *
     * @return whether instrument is enabled
     */
    public Boolean isEnabled() {
        return enabled;
    }

    /**
     * Sets whether the instrument is enabled for trading.
     *
     * @param enabled whether instrument is enabled
     */
    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    /**
     * Returns whether the instrument is tradable (not halted/restricted).
     * NEXT-193 Rejection: tradable=false → INSTRUMENT_NOT_TRADABLE
     *
     * @return whether instrument is tradable
     */
    public Boolean isTradable() {
        return tradable;
    }

    /**
     * Sets whether the instrument is tradable (not halted/restricted).
     *
     * @param tradable whether instrument is tradable
     */
    public void setTradable(Boolean tradable) {
        this.tradable = tradable;
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
