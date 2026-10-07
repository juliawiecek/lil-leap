package com.neueda.leap.reporting.dto;

import java.time.LocalDate;

/**
 * Number of trades executed on a single UTC calendar day.
 *
 * @param date calendar day, serialized as {@code yyyy-MM-dd}
 * @param tradeCount number of executed trades on that day
 */
public record DailyTradeActivityResponse(LocalDate date, long tradeCount) {
}
