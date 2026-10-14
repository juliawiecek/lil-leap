package com.neueda.leap.marketdata;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Open, high, low and close midpoint prices for one time bucket of stored quotes.
 *
 * @param time start of the bucket
 * @param open first midpoint in the bucket
 * @param high highest midpoint in the bucket
 * @param low lowest midpoint in the bucket
 * @param close last midpoint in the bucket
 */
public record PriceCandle(OffsetDateTime time, BigDecimal open, BigDecimal high, BigDecimal low, BigDecimal close) {
}
