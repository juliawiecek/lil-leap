package com.neueda.leap.marketdata;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
public record MarketQuote(UUID quoteId, UUID instrumentId, String symbol, String marketCode, BigDecimal bid, BigDecimal ask, BigDecimal midpoint, OffsetDateTime quotedAt, String source, boolean synthetic) {}
