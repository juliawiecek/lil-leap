package com.neueda.leap.marketdata.controller;

import com.neueda.leap.marketdata.MarketQuote;
import com.neueda.leap.marketdata.QuoteRepository;
import com.neueda.leap.marketdata.dto.QuoteResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class QuoteControllerTest {
    private QuoteRepository repository;
    private MockMvc mockMvc;
    private final UUID instrumentId = UUID.randomUUID();
    private final OffsetDateTime now = OffsetDateTime.now();

    @BeforeEach
    void setUp() {
        repository = mock(QuoteRepository.class);
        mockMvc = standaloneSetup(new QuoteController(repository)).build();
    }

    @Test
    void getLatestByInstrument_success() throws Exception {
        MarketQuote quote = sampleQuote("AAPL", "NASDAQ", now);
        when(repository.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.of(quote));

        mockMvc.perform(get("/quotes/latest/by-instrument/{instrumentId}", instrumentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quoteId").value(quote.quoteId().toString()))
                .andExpect(jsonPath("$.symbol").value("AAPL"))
                .andExpect(jsonPath("$.bid").value(100.50))
                .andExpect(jsonPath("$.ask").value(100.75))
                .andExpect(jsonPath("$.synthetic").value(false));
    }

    @Test
    void getLatestByInstrument_notFound() throws Exception {
        when(repository.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.empty());

        mockMvc.perform(get("/quotes/latest/by-instrument/{instrumentId}", instrumentId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("QUOTE_NOT_FOUND"));
    }

    @Test
    void getLatestByMarketSymbol_success() throws Exception {
        MarketQuote quote = sampleQuote("AAPL", "NASDAQ", now);
        when(repository.findLatestByMarketAndSymbol("NASDAQ", "AAPL")).thenReturn(Optional.of(quote));

        mockMvc.perform(get("/quotes/latest/by-market-symbol")
                .param("market", "NASDAQ")
                .param("symbol", "AAPL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.symbol").value("AAPL"))
                .andExpect(jsonPath("$.marketCode").value("NASDAQ"));
    }

    @Test
    void getLatestByMarketSymbol_normalizeMarketAndSymbol() throws Exception {
        MarketQuote quote = sampleQuote("AAPL", "NASDAQ", now);
        when(repository.findLatestByMarketAndSymbol("NASDAQ", "AAPL")).thenReturn(Optional.of(quote));

        mockMvc.perform(get("/quotes/latest/by-market-symbol")
                .param("market", " nasdaq ")
                .param("symbol", " aapl "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.symbol").value("AAPL"));
    }

    @Test
    void getLatestByMarketSymbol_missingMarket() throws Exception {
        mockMvc.perform(get("/quotes/latest/by-market-symbol")
                .param("symbol", "AAPL"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getLatestByMarketSymbol_emptySymbol() throws Exception {
        mockMvc.perform(get("/quotes/latest/by-market-symbol")
                .param("market", "NASDAQ")
                .param("symbol", ""))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getLatestByMarketSymbol_notFound() throws Exception {
        when(repository.findLatestByMarketAndSymbol("NASDAQ", "ZZZZ")).thenReturn(Optional.empty());

        mockMvc.perform(get("/quotes/latest/by-market-symbol")
                .param("market", "NASDAQ")
                .param("symbol", "ZZZZ"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("QUOTE_NOT_FOUND"));
    }

    @Test
    void getHistory_success() throws Exception {
        MarketQuote q1 = sampleQuote("AAPL", "NASDAQ", now);
        MarketQuote q2 = sampleQuote("AAPL", "NASDAQ", now.minusSeconds(60));
        when(repository.findHistoryByInstrumentId(instrumentId, 100))
                .thenReturn(List.of(q1, q2));

        mockMvc.perform(get("/quotes/history/{instrumentId}", instrumentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(2)))
                .andExpect(jsonPath("$[0].symbol").value("AAPL"))
                .andExpect(jsonPath("$[1].symbol").value("AAPL"));
    }

    @Test
    void getHistory_withCustomLimit() throws Exception {
        MarketQuote q1 = sampleQuote("AAPL", "NASDAQ", now);
        when(repository.findHistoryByInstrumentId(instrumentId, 50))
                .thenReturn(List.of(q1));

        mockMvc.perform(get("/quotes/history/{instrumentId}", instrumentId)
                .param("limit", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(1)));
    }

    @Test
    void getHistory_invalidLimit() throws Exception {
        mockMvc.perform(get("/quotes/history/{instrumentId}", instrumentId)
                .param("limit", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void getHistory_notFound() throws Exception {
        when(repository.findHistoryByInstrumentId(instrumentId, 100))
                .thenReturn(List.of());

        mockMvc.perform(get("/quotes/history/{instrumentId}", instrumentId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("QUOTE_NOT_FOUND"));
    }

    private static MarketQuote sampleQuote(String symbol, String market, OffsetDateTime quotedAt) {
        return new MarketQuote(
                UUID.randomUUID(),
                UUID.randomUUID(),
                symbol,
                market,
                new BigDecimal("100.50"),
                new BigDecimal("100.75"),
                new BigDecimal("100.625"),
                quotedAt,
                "SYNTHETIC_GBM",
                false
        );
    }
}
