package com.neueda.leap.reporting.controller;

import com.neueda.leap.common.exception.GlobalExceptionHandler;
import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.reporting.dto.ClientSegmentActivityResponse;
import com.neueda.leap.reporting.dto.DailyTradeActivityResponse;
import com.neueda.leap.reporting.dto.InsightsOverviewResponse;
import com.neueda.leap.reporting.dto.InstrumentActivityResponse;
import com.neueda.leap.reporting.dto.TopInstrumentResponse;
import com.neueda.leap.reporting.enums.ClientSegment;
import com.neueda.leap.reporting.model.ReportDateRange;
import com.neueda.leap.reporting.service.ReportingService;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ReportingController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class, GlobalExceptionHandler.class})
class ReportingControllerTest {

    private static final LocalDate START = LocalDate.of(2026, 9, 1);
    private static final LocalDate END = LocalDate.of(2026, 9, 30);
    private static final ReportDateRange RANGE = new ReportDateRange(START, END);

    @Autowired MockMvc mvc;
    @Autowired JwtServiceImpl jwtService;
    @MockBean ReportingService reportingService;

    @Test
    void rejectsMissingToken() throws Exception {
        mvc.perform(get("/reports/insights/overview").param("startDate", "2026-09-01").param("endDate", "2026-09-30"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(reportingService);
    }

    @Test
    void rejectsTraders() throws Exception {
        mvc.perform(asRole("TRADER", get("/reports/by-instrument")
                        .param("startDate", "2026-09-01").param("endDate", "2026-09-30")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("ACCESS_DENIED"));
        verifyNoInteractions(reportingService);
    }

    @Test
    void byInstrumentReturnsAggregates() throws Exception {
        when(reportingService.getActivityByInstrument(RANGE)).thenReturn(List.of(
                new InstrumentActivityResponse("AAPL", 120, 5000, new BigDecimal("925000.50"))));

        mvc.perform(asAnalyst(get("/reports/by-instrument")
                        .param("startDate", "2026-09-01").param("endDate", "2026-09-30")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].instrument").value("AAPL"))
                .andExpect(jsonPath("$[0].tradeCount").value(120))
                .andExpect(jsonPath("$[0].totalVolume").value(5000))
                .andExpect(jsonPath("$[0].totalTradeValue").value(925000.50));
    }

    @Test
    void byClientSegmentSerializesSegmentLabel() throws Exception {
        when(reportingService.getActivityByClientSegment(RANGE)).thenReturn(List.of(
                new ClientSegmentActivityResponse(ClientSegment.RETAIL, 450, new BigDecimal("1200000.00"))));

        mvc.perform(asAnalyst(get("/reports/by-client-segment")
                        .param("startDate", "2026-09-01").param("endDate", "2026-09-30")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].clientSegment").value("Retail"))
                .andExpect(jsonPath("$[0].tradeCount").value(450));
    }

    @Test
    void overviewReturnsSummary() throws Exception {
        when(reportingService.getOverview(RANGE)).thenReturn(
                new InsightsOverviewResponse(5000, 2400000, 850, new BigDecimal("18500000.00")));

        mvc.perform(asAnalyst(get("/reports/insights/overview")
                        .param("startDate", "2026-09-01").param("endDate", "2026-09-30")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalTrades").value(5000))
                .andExpect(jsonPath("$.totalTradeVolume").value(2400000))
                .andExpect(jsonPath("$.activeClients").value(850));
    }

    @Test
    void topInstrumentsDefaultsLimitToTen() throws Exception {
        when(reportingService.getTopInstruments(RANGE, 10)).thenReturn(List.of(new TopInstrumentResponse("AAPL", 850)));

        mvc.perform(asAnalyst(get("/reports/insights/top-instruments")
                        .param("startDate", "2026-09-01").param("endDate", "2026-09-30")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].instrument").value("AAPL"))
                .andExpect(jsonPath("$[0].tradeCount").value(850));
        verify(reportingService).getTopInstruments(RANGE, 10);
    }

    @Test
    void topInstrumentsRejectsOutOfBoundsLimit() throws Exception {
        for (String limit : List.of("0", "101", "abc")) {
            mvc.perform(asAnalyst(get("/reports/insights/top-instruments")
                            .param("startDate", "2026-09-01").param("endDate", "2026-09-30").param("limit", limit)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("INVALID_REQUEST"));
        }
        verify(reportingService, never()).getTopInstruments(any(), anyInt());
    }

    @Test
    void clientActivityTrendSerializesIsoDates() throws Exception {
        when(reportingService.getClientActivityTrend(RANGE)).thenReturn(List.of(
                new DailyTradeActivityResponse(START, 120)));

        mvc.perform(asAnalyst(get("/reports/insights/client-activity-trend")
                        .param("startDate", "2026-09-01").param("endDate", "2026-09-30")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].date").value("2026-09-01"))
                .andExpect(jsonPath("$[0].tradeCount").value(120));
    }

    @Test
    void rejectsMissingOrMalformedDates() throws Exception {
        mvc.perform(asAnalyst(get("/reports/by-instrument").param("startDate", "2026-09-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_REQUEST"));
        mvc.perform(asAnalyst(get("/reports/by-instrument")
                        .param("startDate", "09/01/2026").param("endDate", "2026-09-30")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_REQUEST"));
        verifyNoInteractions(reportingService);
    }

    @Test
    void rejectsInvertedOrOversizedRange() throws Exception {
        mvc.perform(asAnalyst(get("/reports/by-instrument")
                        .param("startDate", "2026-09-30").param("endDate", "2026-09-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_DATE_RANGE"));
        mvc.perform(asAnalyst(get("/reports/by-instrument")
                        .param("startDate", "2024-01-01").param("endDate", "2026-09-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_DATE_RANGE"));
        verifyNoInteractions(reportingService);
    }

    private MockHttpServletRequestBuilder asAnalyst(MockHttpServletRequestBuilder request) {
        return asRole("ANALYST", request);
    }

    private MockHttpServletRequestBuilder asRole(String role, MockHttpServletRequestBuilder request) {
        String token = jwtService.issueToken(UUID.randomUUID(), "synthetic.user@example.test", role);
        return request.header("Authorization", "Bearer " + token);
    }
}
