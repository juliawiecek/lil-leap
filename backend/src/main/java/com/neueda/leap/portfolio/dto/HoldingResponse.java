package com.neueda.leap.portfolio.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Client-owned holding returned by the portfolio API. */
public record HoldingResponse(
        UUID accountId,
        UUID instrumentId,
        String symbol,
        String instrumentName,
        long quantity,
        BigDecimal averageCost,
        Instant updatedAt
) {
}
