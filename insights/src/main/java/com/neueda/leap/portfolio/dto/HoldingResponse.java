package com.neueda.leap.portfolio.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Client-owned holding returned by the portfolio API.
 * @param accountId account owning the holding
 * @param instrumentId held instrument identifier
 * @param symbol instrument symbol
 * @param instrumentName instrument display name
 * @param quantity held whole-unit quantity
 * @param averageCost recorded average cost per unit
 * @param updatedAt last holding update time
 */
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
