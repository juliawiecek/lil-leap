package com.neueda.leap.order.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.FetchType;
import jakarta.persistence.IdClass;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Holding entity for the holdings cache table.
 * BR-10: current quantity and average cost per account/instrument, correct as of
 * the last committed settlement. Source of truth is holding_movements (the
 * ledger); this row is a derived cache keyed on (account_id, instrument_id).
 */
@Entity
@Table(name = "holdings")
@IdClass(HoldingId.class)
public class Holding {

    @jakarta.persistence.Id
    @Column(name = "account_id", columnDefinition = "uuid")
    private UUID accountId;

    @jakarta.persistence.Id
    @Column(name = "instrument_id", columnDefinition = "uuid")
    private UUID instrumentId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id", insertable = false, updatable = false)
    private Account account;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "instrument_id", insertable = false, updatable = false)
    private Instrument instrument;

    @Column(name = "quantity", nullable = false)
    private Long quantity;

    @Column(name = "avg_cost", nullable = false, precision = 18, scale = 8)
    private BigDecimal avgCost;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /**
     * Creates an empty entity for JPA hydration.
     */
    public Holding() {
    }

    /**
     * Creates a new holding cache row with zero starting position.
     *
     * @param accountId account owning the holding
     * @param instrumentId instrument held
     */
    public Holding(UUID accountId, UUID instrumentId) {
        this.accountId = accountId;
        this.instrumentId = instrumentId;
        this.quantity = 0L;
        this.avgCost = BigDecimal.ZERO;
    }

    /**
     * Returns the account id this holding belongs to.
     *
     * @return the account id this holding belongs to
     */
    public UUID getAccountId() {
        return accountId;
    }

    /**
     * Returns the instrument id this holding is for.
     *
     * @return the instrument id this holding is for
     */
    public UUID getInstrumentId() {
        return instrumentId;
    }

    /**
     * Returns the current held quantity.
     *
     * @return the current held quantity
     */
    public Long getQuantity() {
        return quantity;
    }

    /**
     * Sets the current held quantity.
     *
     * @param quantity the current held quantity
     */
    public void setQuantity(Long quantity) {
        this.quantity = quantity;
    }

    /**
     * Returns the weighted-average cost per unit.
     *
     * @return the weighted-average cost per unit
     */
    public BigDecimal getAvgCost() {
        return avgCost;
    }

    /**
     * Sets the weighted-average cost per unit.
     *
     * @param avgCost the weighted-average cost per unit
     */
    public void setAvgCost(BigDecimal avgCost) {
        this.avgCost = avgCost;
    }

    /**
     * Returns when this holding was last updated.
     *
     * @return when this holding was last updated
     */
    public Instant getUpdatedAt() {
        return updatedAt;
    }

    /**
     * Sets when this holding was last updated.
     *
     * @param updatedAt when this holding was last updated
     */
    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
