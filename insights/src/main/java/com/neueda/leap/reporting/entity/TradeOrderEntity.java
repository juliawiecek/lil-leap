package com.neueda.leap.reporting.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.util.UUID;

/** Read-only order mapping for dashboard reporting joins. */
@Entity
@Immutable
@Table(name = "orders")
public class TradeOrderEntity {

    @Id
    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Column(name = "account_id", nullable = false)
    private UUID accountId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "instrument_id", nullable = false)
    private InstrumentEntity instrument;

    /** Required by JPA; not for application use. */
    protected TradeOrderEntity() {
    }

    /**
     * Returns the persistent order identifier.
     *
     * @return persistent order identifier
     */
    public UUID getOrderId() {
        return orderId;
    }

    /**
     * Returns the account that placed the order.
     *
     * @return account that placed the order
     */
    public UUID getAccountId() {
        return accountId;
    }


    /**
     * Returns the instrument the order traded.
     *
     * @return instrument the order traded
     */
    public InstrumentEntity getInstrument() {
        return instrument;
    }
}

