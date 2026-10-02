package com.neueda.leap.reporting.dto;

import java.math.BigDecimal;

/**
 * Dashboard summary of trading activity for internal stakeholders.
 *
 * @param totalTrades number of executed trades
 * @param totalTradeVolume total units traded
 * @param activeClients number of distinct clients that traded
 * @param totalTradeValue total notional value traded
 */
public record InsightsOverviewResponse(
        long totalTrades,
        long totalTradeVolume,
        long activeClients,
        BigDecimal totalTradeValue
) {
}
