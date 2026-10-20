package com.neueda.leap.reporting.controller;

import com.neueda.leap.common.exception.GlobalExceptionHandler;
import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.reporting.dto.ClientActivityTrendDto;
import com.neueda.leap.reporting.dto.OverviewDto;
import com.neueda.leap.reporting.dto.TopInstrumentDto;
import com.neueda.leap.reporting.model.ReportDateRange;
import com.neueda.leap.reporting.service.ReportingService;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ReportingController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class, GlobalExceptionHandler.class})
class ReportingControllerTest {

    private static final ReportDateRange OCTOBER =
            new ReportDateRange(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31));

    @Autowired MockMvc mvc;
    @Autowired JwtServiceImpl jwtService;
    @MockBean ReportingService reportingService;

    @Test
    void rejectsMissingToken() throws Exception {
        mvc.perform(get("/reports/insights/overview"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(reportingService);
    }

    @Test
    void rejectsTraders() throws Exception {
        mvc.perform(asRole("TRADER", get("/reports/insights/overview")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("ACCESS_DENIED"));
        verifyNoInteractions(reportingService);
    }

    @Test
    void operationsStaffCanReadReportingToo() throws Exception {
        when(reportingService.getOverview()).thenReturn(
                new OverviewDto(1234, 87, new BigDecimal("1500000.00")));

        mvc.perform(asRole("OPERATIONS", get("/reports/insights/overview")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tradeVolumeToday").value(1234));
    }

    @Test
    void overviewReturnsSummary() throws Exception {
        when(reportingService.getOverview()).thenReturn(
                new OverviewDto(1234, 87, new BigDecimal("1500000.00")));

        mvc.perform(asAnalyst(get("/reports/insights/overview")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tradeVolumeToday").value(1234))
                .andExpect(jsonPath("$.activeClientsToday").value(87))
                .andExpect(jsonPath("$.tradeValueToday").value(1500000.00));
    }

    @Test
    void topInstrumentsReturnsTodayRanking() throws Exception {
        when(reportingService.getTopInstruments()).thenReturn(List.of(new TopInstrumentDto("AAPL", 245)));

        mvc.perform(asAnalyst(get("/reports/insights/top-instruments")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].instrument").value("AAPL"))
                .andExpect(jsonPath("$[0].tradeCount").value(245));
    }

    @Test
    void clientActivityTrendSerializesHours() throws Exception {
        when(reportingService.getClientActivityTrend()).thenReturn(List.of(
                new ClientActivityTrendDto("09:00", 42)));

        mvc.perform(asAnalyst(get("/reports/insights/client-activity-trend")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].hour").value("09:00"))
                .andExpect(jsonPath("$[0].tradeCount").value(42));
    }

    @Test
    void instrumentReportReturnsCsvDownload() throws Exception {
        when(reportingService.generateInstrumentReport(OCTOBER)).thenReturn(csvResponse(
                "instrument-report.csv",
                """
                instrument_symbol,instrument_name,asset_class,market_code,trade_count,total_quantity,total_notional,average_execution_price
                AAPL,Apple Inc.,COMMON_STOCK,NASDAQ,4,500,50780.00,101.56
                """));

        mvc.perform(asAnalyst(inOctober(get("/reports/generate/instrument-report"))))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, org.hamcrest.Matchers.containsString("instrument-report.csv")))
                .andExpect(content().contentTypeCompatibleWith(MediaType.parseMediaType("text/csv")))
                .andExpect(content().string("""
                        instrument_symbol,instrument_name,asset_class,market_code,trade_count,total_quantity,total_notional,average_execution_price
                        AAPL,Apple Inc.,COMMON_STOCK,NASDAQ,4,500,50780.00,101.56
                        """));
    }

    @Test
    void clientSegmentReportReturnsCsvDownload() throws Exception {
        when(reportingService.generateClientSegmentReport(OCTOBER)).thenReturn(csvResponse(
                "client-segment-report.csv",
                """
                client_segment,trade_count,unique_clients,total_quantity,total_notional
                NOVICE,6,2,150560,270770.00
                """));

        mvc.perform(asAnalyst(inOctober(get("/reports/generate/client-segment-report"))))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, org.hamcrest.Matchers.containsString("client-segment-report.csv")))
                .andExpect(content().contentTypeCompatibleWith(MediaType.parseMediaType("text/csv")))
                .andExpect(content().string("""
                        client_segment,trade_count,unique_clients,total_quantity,total_notional
                        NOVICE,6,2,150560,270770.00
                        """));
    }

    @Test
    void tradingActivityReportReturnsCsvDownload() throws Exception {
        when(reportingService.generateTradingActivityReport(OCTOBER)).thenReturn(csvResponse(
                "trading-activity-report.csv",
                """
                trade_date,trade_hour,trade_count,unique_clients,total_quantity,total_notional
                2026-10-02,09:00,2,2,280,41430.00
                """));

        mvc.perform(asAnalyst(inOctober(get("/reports/generate/trading-activity-report"))))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, org.hamcrest.Matchers.containsString("trading-activity-report.csv")))
                .andExpect(content().contentTypeCompatibleWith(MediaType.parseMediaType("text/csv")))
                .andExpect(content().string("""
                        trade_date,trade_hour,trade_count,unique_clients,total_quantity,total_notional
                        2026-10-02,09:00,2,2,280,41430.00
                        """));
    }

    @Test
    void buySellBalanceReportReturnsCsvDownload() throws Exception {
        when(reportingService.generateBuySellBalanceReport(OCTOBER)).thenReturn(csvResponse(
                "buy-sell-balance-report.csv",
                """
                instrument_symbol,instrument_name,asset_class,market_code,buy_trade_count,sell_trade_count,buy_quantity,sell_quantity,net_quantity,buy_notional,sell_notional,net_notional
                KO,The Coca-Cola Company,COMMON_STOCK,NYSE,4,0,727,0,727,49295.24,0.00,49295.24
                """));

        mvc.perform(asAnalyst(inOctober(get("/reports/generate/buy-sell-balance-report"))))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, org.hamcrest.Matchers.containsString("buy-sell-balance-report.csv")))
                .andExpect(content().contentTypeCompatibleWith(MediaType.parseMediaType("text/csv")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("KO,The Coca-Cola Company")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"instrument-report", "client-segment-report", "trading-activity-report", "buy-sell-balance-report"})
    void reportsRequireBothDates(String report) throws Exception {
        mvc.perform(asAnalyst(get("/reports/generate/" + report)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_REQUEST"));
        mvc.perform(asAnalyst(get("/reports/generate/" + report).param("startDate", "2026-10-01")))
                .andExpect(status().isBadRequest());
        mvc.perform(asAnalyst(get("/reports/generate/" + report).param("endDate", "2026-10-31")))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(reportingService);
    }

    @ParameterizedTest
    @ValueSource(strings = {"instrument-report", "client-segment-report", "trading-activity-report", "buy-sell-balance-report"})
    void reportsRejectMalformedAndInvertedDates(String report) throws Exception {
        mvc.perform(asAnalyst(get("/reports/generate/" + report)
                        .param("startDate", "10/01/2026").param("endDate", "2026-10-31")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_REQUEST"));
        mvc.perform(asAnalyst(get("/reports/generate/" + report)
                        .param("startDate", "2026-10-31").param("endDate", "2026-10-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_DATE_RANGE"));
        verifyNoInteractions(reportingService);
    }

    @Test
    void reportsRejectTraders() throws Exception {
        mvc.perform(asRole("TRADER", inOctober(get("/reports/generate/instrument-report"))))
                .andExpect(status().isForbidden());
        verifyNoInteractions(reportingService);
    }

    private MockHttpServletRequestBuilder inOctober(MockHttpServletRequestBuilder request) {
        return request.param("startDate", "2026-10-01").param("endDate", "2026-10-31");
    }

    private MockHttpServletRequestBuilder asAnalyst(MockHttpServletRequestBuilder request) {
        return asRole("ANALYST", request);
    }

    private MockHttpServletRequestBuilder asRole(String role, MockHttpServletRequestBuilder request) {
        String token = jwtService.issueToken(UUID.randomUUID(), "synthetic.user@example.test", role);
        return request.header("Authorization", "Bearer " + token);
    }

    private ResponseEntity<Resource> csvResponse(String filename, String body) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(new ByteArrayResource(body.getBytes(StandardCharsets.UTF_8)));
    }
}
