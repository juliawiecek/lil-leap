package com.neueda.leap.portfolio.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Client-owned cash balance with settlement distinction returned by the portfolio API.
 * TS-11.3 AC2: Distinguishes settled vs available vs pending cash.
 *
 * @param accountId account owning the balance
 * @param currency currency code stored with the balance
 * @param settledBalance cash marked settled in the ledger (current execution settles immediately)
 * @param pendingBalance cash from pending transactions not yet settled
 * @param availableBalance settled cash minus active holds on pending orders (can be used to trade)
 * @param totalBalance sum of all cash (settled + pending)
 * @param updatedAt last balance update time
 */
public record CashBalanceDetailResponse(
        UUID accountId,
        String currency,
        BigDecimal settledBalance,
        BigDecimal pendingBalance,
        BigDecimal availableBalance,
        BigDecimal totalBalance,
        Instant updatedAt
) {
}
