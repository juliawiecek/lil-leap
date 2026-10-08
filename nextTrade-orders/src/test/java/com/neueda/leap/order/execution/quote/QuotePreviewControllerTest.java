package com.neueda.leap.order.execution.quote;

import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.instrument.dto.InstrumentResponse;
import com.neueda.leap.instrument.service.InstrumentService;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** GET /orders/quote-preview through the real security chain (TS-14.3, BR-13). */
@WebMvcTest(QuotePreviewController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class})
class QuotePreviewControllerTest {
    private static final String PREVIEW = "/orders/quote-preview";
    private static final String AUTHORIZATION = "Authorization";

    @Autowired MockMvc mvc;
    @Autowired JwtServiceImpl tokens;
    @MockBean IndicativePriceService prices;
    @MockBean InstrumentService instruments;

    private final UUID instrumentId = UUID.randomUUID();

    @Test
    void traderGetsAnIndicativeEstimateBySymbol() throws Exception {
        when(instruments.findInstrumentBySymbol("AAPL")).thenReturn(Optional.of(instrument()));
        when(prices.estimate(instrumentId, "BUY", 10)).thenReturn(Optional.of(estimate()));

        mvc.perform(get(PREVIEW).header(AUTHORIZATION, bearer())
                        .param("symbol", "aapl").param("side", "buy").param("quantity", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.symbol").value("AAPL"))
                .andExpect(jsonPath("$.side").value("BUY"))
                .andExpect(jsonPath("$.indicativePrice").value(225.50))
                .andExpect(jsonPath("$.estimatedTotal").value(2255.00))
                .andExpect(jsonPath("$.indicative").value(true))
                .andExpect(jsonPath("$.stale").value(false));
    }

    @Test
    void traderCanPreviewByInstrumentId() throws Exception {
        when(instruments.findInstrumentById(instrumentId)).thenReturn(Optional.of(instrument()));
        when(prices.estimate(instrumentId, "SELL", 2)).thenReturn(Optional.of(estimate()));

        mvc.perform(get(PREVIEW).header(AUTHORIZATION, bearer())
                        .param("instrumentId", instrumentId.toString()).param("side", "SELL").param("quantity", "2"))
                .andExpect(status().isOk());
    }

    @Test
    void missingAuthenticationIsRejected() throws Exception {
        mvc.perform(get(PREVIEW).param("symbol", "AAPL").param("side", "BUY").param("quantity", "1"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(prices, instruments);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "side=BUY&quantity=1",
            "symbol=AAPL&instrumentId=00000000-0000-0000-0000-000000000000&side=BUY&quantity=1",
            "symbol=AAPL&side=HOLD&quantity=1",
            "symbol=AAPL&side=BUY&quantity=0",
            "symbol=AAPL&side=BUY&quantity=ten",
            "symbol=AAPL&side=BUY",
            "instrumentId=not-a-uuid&side=BUY&quantity=1",
            "instrumentId=------------------------------------&side=BUY&quantity=1",
            "symbol=AA%20PL&side=BUY&quantity=1"})
    void invalidInputIsABadRequest(String query) throws Exception {
        mvc.perform(get(PREVIEW + "?" + query).header(AUTHORIZATION, bearer()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_REQUEST"));
        verifyNoInteractions(prices);
    }

    @Test
    void unknownSymbolIsNotFound() throws Exception {
        when(instruments.findInstrumentBySymbol("NOPE")).thenReturn(Optional.empty());

        mvc.perform(get(PREVIEW).header(AUTHORIZATION, bearer())
                        .param("symbol", "NOPE").param("side", "BUY").param("quantity", "1"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("INSTRUMENT_NOT_FOUND"));
    }

    @Test
    void missingQuoteIsNotFoundWithASpecificCode() throws Exception {
        when(instruments.findInstrumentBySymbol("AAPL")).thenReturn(Optional.of(instrument()));
        when(prices.estimate(instrumentId, "BUY", 1)).thenReturn(Optional.empty());

        mvc.perform(get(PREVIEW).header(AUTHORIZATION, bearer())
                        .param("symbol", "AAPL").param("side", "BUY").param("quantity", "1"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("NO_QUOTE_AVAILABLE"));
    }

    @Test
    void otherOrderRoutesStayClosed() throws Exception {
        mvc.perform(get("/orders/quote-preview-by-id").header(AUTHORIZATION, bearer())
                        .param("instrumentId", instrumentId.toString()))
                .andExpect(status().isForbidden());
    }

    private String bearer() {
        return "Bearer " + tokens.issueToken(UUID.randomUUID(), "trader@example.test");
    }

    private InstrumentResponse instrument() {
        return new InstrumentResponse(instrumentId, "AAPL", "Apple Inc.", "COMMON_STOCK",
                "NASDAQ", "USD", "Technology", true, true);
    }

    private IndicativePriceService.IndicativePrice estimate() {
        return new IndicativePriceService.IndicativePrice("AAPL", instrumentId, "BUY", 10,
                new BigDecimal("225.50"), new BigDecimal("2255.00"),
                OffsetDateTime.now(ZoneOffset.UTC), false, true);
    }
}
