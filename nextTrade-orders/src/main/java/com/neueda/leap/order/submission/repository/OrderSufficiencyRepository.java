package com.neueda.leap.order.submission.repository;

import java.math.BigDecimal;
import java.util.UUID;

/** Account-scoped balances used after the submission service authorizes the caller. */
public interface OrderSufficiencyRepository {
    /**
     * Reads the current USD cash balance.
     * @param accountId authorized account
     * @return current cash, or zero when no balance exists
     */
    BigDecimal cashBalance(UUID accountId);

    /**
     * Reads the account's configured execution buffer.
     * @param accountId authorized existing account
     * @return buffer percentage used when an order has no override
     */
    BigDecimal executionBufferPercent(UUID accountId);

    /**
     * Reads units owned in this account only.
     * @param accountId authorized account
     * @param instrumentId resolved instrument
     * @return owned quantity, or zero when no position exists
     */
    long holdingQuantity(UUID accountId, UUID instrumentId);
}
