package com.neueda.leap.reporting.dto;

import java.math.BigDecimal;

/**
 * Trading activity aggregated for a single instrument.
 *
 * @param instrument instrument symbol
 * @param tradeCount number of executed trades
 * @param totalVolume total units traded
 * @param totalTradeValue total notional value traded
 */
public record InstrumentActivityResponse(
        String instrument,
        long tradeCount,
        long totalVolume,
        BigDecimal totalTradeValue
) {
}
