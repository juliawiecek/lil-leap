package com.neueda.leap.order.model;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/**
 * Composite primary key for {@link Holding}: one row per account/instrument pair.
 */
public class HoldingId implements Serializable {

    private UUID accountId;
    private UUID instrumentId;

    /**
     * Creates an empty id for JPA hydration.
     */
    public HoldingId() {
    }

    /**
     * Creates a holding id for the given account/instrument pair.
     *
     * @param accountId account owning the holding
     * @param instrumentId instrument held
     */
    public HoldingId(UUID accountId, UUID instrumentId) {
        this.accountId = accountId;
        this.instrumentId = instrumentId;
    }

    /**
     * Returns the account id half of this key.
     *
     * @return the account id half of this key
     */
    public UUID getAccountId() {
        return accountId;
    }

    /**
     * Sets the account id half of this key.
     *
     * @param accountId the account id half of this key
     */
    public void setAccountId(UUID accountId) {
        this.accountId = accountId;
    }

    /**
     * Returns the instrument id half of this key.
     *
     * @return the instrument id half of this key
     */
    public UUID getInstrumentId() {
        return instrumentId;
    }

    /**
     * Sets the instrument id half of this key.
     *
     * @param instrumentId the instrument id half of this key
     */
    public void setInstrumentId(UUID instrumentId) {
        this.instrumentId = instrumentId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof HoldingId other)) {
            return false;
        }
        return Objects.equals(accountId, other.accountId) && Objects.equals(instrumentId, other.instrumentId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(accountId, instrumentId);
    }
}
