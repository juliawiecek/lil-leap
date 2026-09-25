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
    /**
     * Creates an empty entity for JPA hydration or application initialization.
     */
    public HoldingMovement() {
    }

    /**
     * Creates a {@code HoldingMovement} with the supplied initial values.
     *
     * @param movementId movement id
     * @param account account owning the trade
     * @param instrument instrument being traded
     * @param fill fill associated with this ledger entry
     * @param quantityChange signed unit change; positive for buys and negative for sells
     * @param costBasis cost basis per unit
     * @param movementType holdings ledger event type
     */
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
    /**
     * Returns movement id.
     *
     * @return movement id
     */
    public UUID getMovementId() {
        return movementId;
    }

    /**
     * Sets movement id.
     *
     * @param movementId movement id
     */
    public void setMovementId(UUID movementId) {
        this.movementId = movementId;
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
     * Returns fill associated with this ledger entry.
     *
     * @return fill associated with this ledger entry
     */
    public Fill getFill() {
        return fill;
    }

    /**
     * Sets fill associated with this ledger entry.
     *
     * @param fill fill associated with this ledger entry
     */
    public void setFill(Fill fill) {
        this.fill = fill;
    }

    /**
     * Returns signed unit change; positive for buys and negative for sells.
     *
     * @return signed unit change; positive for buys and negative for sells
     */
    public Long getQuantityChange() {
        return quantityChange;
    }

    /**
     * Sets signed unit change; positive for buys and negative for sells.
     *
     * @param quantityChange signed unit change; positive for buys and negative for sells
     */
    public void setQuantityChange(Long quantityChange) {
        this.quantityChange = quantityChange;
    }

    /**
     * Returns cost basis per unit.
     *
     * @return cost basis per unit
     */
    public BigDecimal getCostBasis() {
        return costBasis;
    }

    /**
     * Sets cost basis per unit.
     *
     * @param costBasis cost basis per unit
     */
    public void setCostBasis(BigDecimal costBasis) {
        this.costBasis = costBasis;
    }

    /**
     * Returns holdings ledger event type.
     *
     * @return holdings ledger event type
     */
    public String getMovementType() {
        return movementType;
    }

    /**
     * Sets holdings ledger event type.
     *
     * @param movementType holdings ledger event type
     */
    public void setMovementType(String movementType) {
        this.movementType = movementType;
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
