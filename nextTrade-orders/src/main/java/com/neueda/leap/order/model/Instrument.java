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
    public Instrument() {
    }

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
    public UUID getInstrumentId() {
        return instrumentId;
    }

    public void setInstrumentId(UUID instrumentId) {
        this.instrumentId = instrumentId;
    }

    public String getSymbol() {
        return symbol;
    }

    public void setSymbol(String symbol) {
        this.symbol = symbol;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getAssetClass() {
        return assetClass;
    }

    public void setAssetClass(String assetClass) {
        this.assetClass = assetClass;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public String getMarket() {
        return market;
    }

    public void setMarket(String market) {
        this.market = market;
    }

    public Boolean getIsActive() {
        return isActive;
    }

    public void setIsActive(Boolean isActive) {
        this.isActive = isActive;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
