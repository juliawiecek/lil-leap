package com.neueda.leap.marketdata.generation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.neueda.leap.marketdata.generation.SyntheticQuoteModel.GeneratedQuote;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class SyntheticQuoteModelTest {
    private static final List<CatalogInstrument> CATALOG = CatalogInstrument.load();

    @Test
    void bundledCatalogListsEverySeededStockOnce() {
        assertEquals(33, CATALOG.size());
        assertEquals(new CatalogInstrument("AAPL", "NASDAQ", "USD", 225.00, 0.08, 0.25), CATALOG.get(0));
        assertEquals(CATALOG.size(), CATALOG.stream().map(i -> i.marketCode() + ":" + i.symbol()).distinct().count());
        assertTrue(CATALOG.stream().anyMatch(i -> i.symbol().equals("JPM") && i.marketCode().equals("NYSE")));
    }

    @Test
    void catalogRowsAreNormalizedAndValidated() {
        String header = "symbol,market_code,currency,asset_class,start_price,drift,volatility\n";
        assertEquals(List.of(new CatalogInstrument("KO", "NYSE", "USD", 68, 0.04, 0.14)),
                CatalogInstrument.parse(header + " ko , nyse ,usd,COMMON_STOCK,68,0.04,0.14\n\n"));
        assertThrows(IllegalArgumentException.class, () -> CatalogInstrument.parse("symbol,price\nKO,1\n"));
        assertThrows(IllegalArgumentException.class, () -> CatalogInstrument.parse(header));
        assertThrows(IllegalArgumentException.class, () -> CatalogInstrument.parse(header + "KO,NYSE,USD\n"));
        assertThrows(IllegalArgumentException.class, () -> new CatalogInstrument("KO", "NYSE", "USD", 0, 0, 0.1));
        assertThrows(IllegalArgumentException.class, () -> new CatalogInstrument("KO", "NYSE", "USD", 1, 0, -0.1));
        assertThrows(IllegalArgumentException.class, () -> new CatalogInstrument("KO", "NYSE", "US", 1, 0, 0.1));
        assertThrows(IllegalArgumentException.class, () -> new CatalogInstrument(" ", "NYSE", "USD", 1, 0, 0.1));
    }

    @Test
    void sameSeedGivesSamePricesAndTheNextTickMoves() {
        List<GeneratedQuote> first = SyntheticQuoteModel.tick(CATALOG, 42);
        assertEquals(first, SyntheticQuoteModel.tick(CATALOG, 42));
        assertNotEquals(first, SyntheticQuoteModel.tick(CATALOG, 43));
        assertEquals(CATALOG, first.stream().map(GeneratedQuote::instrument).toList());
    }

    @Test
    void everyQuoteHasFourDecimalsAndAPositiveSpreadAroundThePrice() {
        for (long seed = 0; seed < 50; seed++) {
            for (GeneratedQuote quote : SyntheticQuoteModel.tick(CATALOG, seed)) {
                assertEquals(4, quote.price().scale());
                assertTrue(quote.bid().signum() > 0);
                assertTrue(quote.bid().compareTo(quote.price()) < 0);
                assertTrue(quote.price().compareTo(quote.ask()) < 0);
                assertEquals(quote.price().subtract(quote.bid()), quote.ask().subtract(quote.price()));
            }
        }
    }

    @Test
    void pricesStayCloseToTheCatalogStartPrice() {
        // Two one-minute steps: even TSLA's 55% volatility moves a few tenths of a percent.
        for (GeneratedQuote quote : SyntheticQuoteModel.tick(CATALOG, 7)) {
            double move = Math.abs(quote.price().doubleValue() / quote.instrument().startPrice() - 1);
            assertTrue(move < 0.02, quote.instrument().symbol() + " moved " + move);
        }
    }

    @Test
    void spreadIsTwoBasisPointsRoundedHalfEvenWithAFloor() {
        CatalogInstrument stock = CATALOG.get(0);
        GeneratedQuote quote = SyntheticQuoteModel.quote(stock, 225.123456);
        assertEquals(new BigDecimal("225.1235"), quote.price());
        assertEquals(new BigDecimal("225.0785"), quote.bid());
        assertEquals(new BigDecimal("225.1685"), quote.ask());
        GeneratedQuote penny = SyntheticQuoteModel.quote(stock, 0.25);
        assertEquals(new BigDecimal("0.2499"), penny.bid());
        assertEquals(new BigDecimal("0.2501"), penny.ask());
        assertEquals(new BigDecimal("1.0002"), SyntheticQuoteModel.quote(stock, 1.00025).price());
    }
}
