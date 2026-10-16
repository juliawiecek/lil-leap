package com.neueda.leap.reporting.dto;

/**
 * Hourly trading activity entry for the current-day dashboard.
 *
 * @param hour UTC hour label in {@code HH:mm} format
 * @param tradeCount number of executed trades in that hour
 */
public record ClientActivityTrendDto(String hour, long tradeCount) {
}

