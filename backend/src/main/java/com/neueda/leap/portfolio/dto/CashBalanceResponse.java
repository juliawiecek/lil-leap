package com.neueda.leap.portfolio.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Client-owned cash balance returned by the portfolio API. */
public record CashBalanceResponse(
        UUID accountId,
        String currency,
        BigDecimal balance,
        Instant updatedAt
) {
}
