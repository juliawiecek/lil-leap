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

    /** Required by JPA; not for application use. */
    protected InstrumentEntity() {
    }

    /**
     * Returns the persistent instrument identifier.
     *
     * @return persistent instrument identifier
     */
    public UUID getInstrumentId() {
        return instrumentId;
    }

    /**
     * Returns the instrument trading symbol.
     *
     * @return instrument trading symbol
     */
    public String getSymbol() {
        return symbol;
    }
}

