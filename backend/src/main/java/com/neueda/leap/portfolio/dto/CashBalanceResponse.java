package com.neueda.leap.portfolio.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Client-owned cash balance returned by the portfolio API.
 * @param accountId account owning the balance
 * @param currency currency code stored with the balance
 * @param balance recorded cash balance in that currency
 * @param updatedAt last balance update time
 */
public record CashBalanceResponse(
        UUID accountId,
        String currency,
        BigDecimal balance,
        Instant updatedAt
) {
}
