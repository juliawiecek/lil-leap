package com.neueda.leap.reporting.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.util.UUID;

/**
 * Read-only instrument mapping for dashboard reporting.
 */
@Entity
@Immutable
@Table(name = "instruments")
public class InstrumentEntity {

    @Id
    @Column(name = "instrument_id", nullable = false)
    private UUID instrumentId;

    @Column(name = "symbol", nullable = false, length = 20)
    private String symbol;

    protected InstrumentEntity() {
    }

    public UUID getInstrumentId() {
        return instrumentId;
    }

    public String getSymbol() {
        return symbol;
    }
}

