package com.neueda.leap.portfolio.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Single holding owned by a client, returned by the portfolio API.
 *
 * <p>TS-11.1c AC1: GET /holdings/{accountId}/{instrumentId} returns detail
 * for one holding, scoped to the authenticated caller.</p>
 *
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
