package com.neueda.leap.order.submission.repository;

import java.math.BigDecimal;

/** Account fields needed by NEXT-99 before a new order is accepted. */
public record AccountTradingProfile(
        String accountStatus,
        boolean tradingEnabled,
        String traderLevel,
        BigDecimal minimumBalanceRequirement,
        BigDecimal currentBalance) {
}
