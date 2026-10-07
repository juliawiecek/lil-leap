package com.neueda.leap.reporting.dto;

/**
 * Most-active instrument entry for the current-day dashboard.
 *
 * @param instrument instrument symbol
 * @param tradeCount number of executed trades today
 */
public record TopInstrumentDto(String instrument, long tradeCount) {
}

