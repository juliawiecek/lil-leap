package com.neueda.leap.reporting.dto;

import java.math.BigDecimal;

/**
 * Current-day dashboard summary for internal stakeholders.
 *
 * @param tradeVolumeToday total units traded today
 * @param activeClientsToday distinct clients who traded today
 * @param tradeValueToday total traded notional value today
 */
public record OverviewDto(
        long tradeVolumeToday,
        long activeClientsToday,
        BigDecimal tradeValueToday
) {
}

