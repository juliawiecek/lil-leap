package com.neueda.leap.order.repository;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Provides balance and holdings queries scoped to a specific account.
 * Reads from shared cash_balances and holdings tables.
 */
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
