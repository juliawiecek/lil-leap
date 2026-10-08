package com.neueda.leap.order.execution.cash;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Settlement-only cash movements (TS-10.2b). These are the service-internal form of
 * {@code POST /cash/buy} and {@code POST /cash/sell}: there is no HTTP route, and every method
 * must run inside the caller's existing settlement transaction, so cash can never change
 * without the fill, holdings movement and status that go with it.
 */
public interface CashMovementAdapter {

    /**
     * Locks the account and its USD balance for the rest of the settlement transaction.
     *
     * @param accountId account being settled
     * @return current USD balance, or zero when the account has no balance row yet
     */
    BigDecimal lockBalance(UUID accountId);

    /**
     * Debits the cost of a buy fill: a BUY ledger entry and the matching balance change.
     *
     * @param accountId account being settled
     * @param fillId fill that this debit pays for
     * @param amount positive amount in USD, at most two decimal places
     * @return USD balance after the debit
     */
    BigDecimal buy(UUID accountId, UUID fillId, BigDecimal amount);

    /**
     * Credits the proceeds of a sell fill: a SELL ledger entry and the matching balance change.
     *
     * @param accountId account being settled
     * @param fillId fill that produced these proceeds
     * @param amount positive amount in USD, at most two decimal places
     * @return USD balance after the credit
     */
    BigDecimal sell(UUID accountId, UUID fillId, BigDecimal amount);
}
