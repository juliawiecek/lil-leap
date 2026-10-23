package com.neueda.leap.marketdata.controller;

import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.marketdata.CandleInterval;
import com.neueda.leap.marketdata.PriceCandle;
import com.neueda.leap.marketdata.QuoteRepository;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(QuoteController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class})
class QuoteCandlesTest {
    @org.springframework.boot.test.mock.mockito.MockBean
    private com.neueda.leap.security.AuthSessionClient activeSessions;

    @org.junit.jupiter.api.BeforeEach
    void allowTestSessions() {
        org.mockito.Mockito.when(activeSessions.test(org.mockito.ArgumentMatchers.anyString())).thenReturn(true);
    }

    @Autowired MockMvc mvc;
    @Autowired JwtServiceImpl tokens;
    @MockBean QuoteRepository repository;

    private final UUID instrument = UUID.randomUUID();

    private String trader() {
        return "Bearer " + tokens.issueToken(UUID.randomUUID(), "trader@example.test", "TRADER");
    }

    @Test
    void candlesRequireAToken() throws Exception {
        mvc.perform(get("/quotes/candles/{id}", instrument)).andExpect(status().isUnauthorized());
        verifyNoInteractions(repository);
    }

    @Test
    void defaultsToTwoHoursOfOneMinuteCandles() throws Exception {
        PriceCandle candle = new PriceCandle(OffsetDateTime.parse("2026-10-14T09:52:00Z"),
                new BigDecimal("225.12"), new BigDecimal("225.47"), new BigDecimal("224.60"), new BigDecimal("225.28"));
        when(repository.findCandles(instrument, CandleInterval.ONE_MINUTE, 120)).thenReturn(List.of(candle));

        mvc.perform(get("/quotes/candles/{id}", instrument).header("Authorization", trader()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].open").value(225.12))
                .andExpect(jsonPath("$[0].high").value(225.47))
                .andExpect(jsonPath("$[0].low").value(224.60))
                .andExpect(jsonPath("$[0].close").value(225.28))
                .andExpect(jsonPath("$[0].time").exists());
    }

    @Test
    void passesTheRequestedIntervalAndLimit() throws Exception {
        when(repository.findCandles(any(), any(), anyInt())).thenReturn(List.of());

        mvc.perform(get("/quotes/candles/{id}", instrument).param("interval", "1h").param("limit", "24")
                        .header("Authorization", trader()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
        verify(repository).findCandles(instrument, CandleInterval.ONE_HOUR, 24);
    }

    @Test
    void rejectsAnUnknownIntervalOrNonPositiveLimit() throws Exception {
        mvc.perform(get("/quotes/candles/{id}", instrument).param("interval", "2m").header("Authorization", trader()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mvc.perform(get("/quotes/candles/{id}", instrument).param("limit", "0").header("Authorization", trader()))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(repository);
    }
}
