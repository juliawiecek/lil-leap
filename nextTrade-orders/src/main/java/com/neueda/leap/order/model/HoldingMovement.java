package com.neueda.leap.order.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * HoldingMovement entity for append-only ledger of quantity changes.
 * BR-09, BR-10: Append-only ledger where every fill creates an immutable movement record.
 * Source of truth for holdings: holdings table is computed cache.
 * BR-15: Enables reconstruction of any account state from ledger.
 */
@Entity
@Table(name = "holding_movements", uniqueConstraints = {
    @UniqueConstraint(name = "uk_movement_fill", columnNames = "fill_id")
}, indexes = {
    @Index(name = "idx_movement_account", columnList = "account_id"),
    @Index(name = "idx_movement_instrument", columnList = "instrument_id"),
    @Index(name = "idx_movement_created_at", columnList = "created_at DESC"),
    @Index(name = "idx_movement_fill", columnList = "fill_id")
})
public class HoldingMovement {
    
    @Id
    @Column(columnDefinition = "uuid")
    private UUID movementId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "instrument_id", nullable = false)
    private Instrument instrument;
    
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "fill_id", nullable = false)
    private Fill fill;
    
    @Column(name = "quantity_change", nullable = false)
    private Long quantityChange;
    
    @Column(name = "cost_basis", nullable = false, precision = 18, scale = 8)
    private BigDecimal costBasis;
    
    @Column(name = "movement_type", nullable = false, length = 20)
    private String movementType;  // BUY, SELL, DIVIDEND, SPLIT, CORRECTION

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    // Constructors
    public HoldingMovement() {
    }

    public HoldingMovement(UUID movementId, Account account, Instrument instrument, Fill fill,
                          Long quantityChange, BigDecimal costBasis, String movementType) {
        this.movementId = movementId;
        this.account = account;
        this.instrument = instrument;
        this.fill = fill;
        this.quantityChange = quantityChange;
        this.costBasis = costBasis;
        this.movementType = movementType;
    }

    // Getters and Setters
    public UUID getMovementId() {
        return movementId;
    }

    public void setMovementId(UUID movementId) {
        this.movementId = movementId;
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

    public Fill getFill() {
        return fill;
    }

    public void setFill(Fill fill) {
        this.fill = fill;
    }

    public Long getQuantityChange() {
        return quantityChange;
    }

    public void setQuantityChange(Long quantityChange) {
        this.quantityChange = quantityChange;
    }

    public BigDecimal getCostBasis() {
        return costBasis;
    }

    public void setCostBasis(BigDecimal costBasis) {
        this.costBasis = costBasis;
    }

    public String getMovementType() {
        return movementType;
    }

    public void setMovementType(String movementType) {
        this.movementType = movementType;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
