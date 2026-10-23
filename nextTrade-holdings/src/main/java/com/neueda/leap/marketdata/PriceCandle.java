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
 * @param bidClose bid at the last quote, for historical liquidation valuations
 * @param observedAt actual last quote timestamp, not the theoretical bucket end
 */
public record PriceCandle(OffsetDateTime time, BigDecimal open, BigDecimal high, BigDecimal low, BigDecimal close,
                          BigDecimal bidClose, OffsetDateTime observedAt) {
    /**
     * Constructs a legacy midpoint-only candle with no bid/time observation metadata.
     * @param time bucket start
     * @param open opening midpoint
     * @param high highest midpoint
     * @param low lowest midpoint
     * @param close closing midpoint
     */
    public PriceCandle(OffsetDateTime time, BigDecimal open, BigDecimal high, BigDecimal low, BigDecimal close) {
        this(time, open, high, low, close, null, null);
    }
}
