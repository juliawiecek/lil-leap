package com.neueda.leap.reporting.dto;

import com.neueda.leap.reporting.enums.ClientSegment;

import java.math.BigDecimal;

/**
 * Trading activity aggregated for a single client segment.
 *
 * @param clientSegment client segment, serialized by its display label
 * @param tradeCount number of executed trades
 * @param totalTradeValue total notional value traded
 */
public record ClientSegmentActivityResponse(
        ClientSegment clientSegment,
        long tradeCount,
        BigDecimal totalTradeValue
) {
}
