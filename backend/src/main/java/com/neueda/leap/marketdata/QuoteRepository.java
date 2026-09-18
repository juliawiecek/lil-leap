package com.neueda.leap.marketdata;
import java.util.Optional;
import java.util.UUID;
public interface QuoteRepository { Optional<MarketQuote> findLatestByInstrumentId(UUID instrumentId); Optional<MarketQuote> findLatestByMarketAndSymbol(String marketCode, String symbol); }
