package com.neueda.leap.order.execution.quote;

import com.neueda.leap.marketdata.MarketQuote;
import com.neueda.leap.marketdata.QuoteRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * Estimates what an order would cost before it is submitted (TS-14.1, BR-13).
 * Reads the latest stored quote rather than calling a provider, so it is cheap enough to
 * call on every quantity change. Buys are priced at the ask and sells at the bid, the same
 * sides execution fills at, but the result is never a guaranteed fill price.
 */
@Service
public class IndicativePriceService {
    private final QuoteRepository quotes;
    private final QuoteFreshnessPolicy freshness;
    private final Clock clock;

    /**
     * Creates the service.
     *
     * @param quotes latest stored quotes
     * @param freshness the age limit execution applies, used to flag stale estimates
     * @param clock UTC clock shared with execution
     */
    public IndicativePriceService(QuoteRepository quotes, QuoteFreshnessPolicy freshness, Clock clock) {
        this.quotes = quotes;
        this.freshness = freshness;
        this.clock = clock;
    }

    /**
     * Estimates the price and total for an order from the latest stored quote.
     *
     * @param instrumentId instrument to price
     * @param side {@code BUY} or {@code SELL}
     * @param quantity positive number of shares
     * @return the estimate, or empty when no quote has been stored for the instrument
     */
    public Optional<IndicativePrice> estimate(UUID instrumentId, String side, long quantity) {
        return quotes.findLatestByInstrumentId(instrumentId).map(quote -> price(quote, side, quantity));
    }

    private IndicativePrice price(MarketQuote quote, String side, long quantity) {
        BigDecimal price = "BUY".equals(side) ? quote.ask() : quote.bid();
        BigDecimal total = price.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP);
        boolean stale = freshness.evaluate(quote.quotedAt(), OffsetDateTime.now(clock))
                != QuoteFreshnessPolicy.Freshness.FRESH;
        return new IndicativePrice(quote.symbol(), quote.instrumentId(), side, quantity,
                price, total, quote.quotedAt(), stale, true);
    }

    /**
     * An estimate for an order that has not been submitted.
     *
     * @param symbol instrument symbol
     * @param instrumentId instrument identifier
     * @param side {@code BUY} or {@code SELL}
     * @param quantity number of shares
     * @param indicativePrice ask for a buy, bid for a sell
     * @param estimatedTotal price multiplied by quantity, rounded to cents
     * @param quotedAt when the quote was taken
     * @param stale true when the quote is too old for execution to use
     * @param indicative always true; this is an estimate, not a guaranteed fill price
     */
    public record IndicativePrice(String symbol, UUID instrumentId, String side, long quantity,
                                  BigDecimal indicativePrice, BigDecimal estimatedTotal,
                                  OffsetDateTime quotedAt, boolean stale, boolean indicative) {}
}
