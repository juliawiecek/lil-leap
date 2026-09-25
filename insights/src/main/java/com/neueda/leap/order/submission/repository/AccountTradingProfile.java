package com.neueda.leap.order.submission.repository;

import java.math.BigDecimal;

/**
 * Account fields needed by NEXT-99 before a new order is accepted.
 *
 * @param accountStatus account lifecycle status
 * @param tradingEnabled whether trading is enabled for the account
 * @param traderLevel assigned trader tier
 * @param minimumBalanceRequirement minimum cash balance required for the trader tier
 * @param currentBalance current USD cash balance
 */
public record AccountTradingProfile(
        String accountStatus,
        boolean tradingEnabled,
        String traderLevel,
        BigDecimal minimumBalanceRequirement,
        BigDecimal currentBalance) {
}
