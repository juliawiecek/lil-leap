package com.neueda.leap.reporting.entity;

import com.neueda.leap.onboarding.entity.Account;
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

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "instrument_id", nullable = false)
    private InstrumentEntity instrument;

    protected TradeOrderEntity() {
    }

    public UUID getOrderId() {
        return orderId;
    }

    public Account getAccount() {
        return account;
    }

    public InstrumentEntity getInstrument() {
        return instrument;
    }
}

