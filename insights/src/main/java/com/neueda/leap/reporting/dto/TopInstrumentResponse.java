package com.neueda.leap.reporting.dto;

/**
 * An instrument ranked by trading activity.
 *
 * @param instrument instrument symbol
 * @param tradeCount number of executed trades
 */
public record TopInstrumentResponse(String instrument, long tradeCount) {
}
