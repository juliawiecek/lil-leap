package com.neueda.leap.reporting.controller;

import com.neueda.leap.common.exception.GlobalExceptionHandler;
import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.reporting.dto.ClientActivityTrendDto;
import com.neueda.leap.reporting.dto.OverviewDto;
import com.neueda.leap.reporting.dto.TopInstrumentDto;
import com.neueda.leap.reporting.service.ReportingService;
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
        when(reportingService.generateInstrumentReport()).thenReturn(csvResponse(
                "instrument-report.csv",
                "instrument_symbol,instrument_name,asset_class,market_code,trade_count,total_quantity,total_notional,average_execution_price\n"
                        + "AAPL,Apple Inc.,COMMON_STOCK,NASDAQ,4,500,50780.00,101.56\n"));

        mvc.perform(asAnalyst(get("/reports/generate/instrument-report")))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, org.hamcrest.Matchers.containsString("instrument-report.csv")))
                .andExpect(content().contentTypeCompatibleWith(MediaType.parseMediaType("text/csv")))
                .andExpect(content().string(
                        "instrument_symbol,instrument_name,asset_class,market_code,trade_count,total_quantity,total_notional,average_execution_price\n"
                                + "AAPL,Apple Inc.,COMMON_STOCK,NASDAQ,4,500,50780.00,101.56\n"));
    }

    @Test
    void clientSegmentReportReturnsCsvDownload() throws Exception {
        when(reportingService.generateClientSegmentReport()).thenReturn(csvResponse(
                "client-segment-report.csv",
                "client_segment,trade_count,unique_clients,total_quantity,total_notional\n"
                        + "NOVICE,6,2,150560,270770.00\n"));

        mvc.perform(asAnalyst(get("/reports/generate/client-segment-report")))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, org.hamcrest.Matchers.containsString("client-segment-report.csv")))
                .andExpect(content().contentTypeCompatibleWith(MediaType.parseMediaType("text/csv")))
                .andExpect(content().string(
                        "client_segment,trade_count,unique_clients,total_quantity,total_notional\n"
                                + "NOVICE,6,2,150560,270770.00\n"));
    }

    @Test
    void tradingActivityReportReturnsCsvDownload() throws Exception {
        when(reportingService.generateTradingActivityReport()).thenReturn(csvResponse(
                "trading-activity-report.csv",
                "trade_date,trade_hour,trade_count,unique_clients,total_quantity,total_notional\n"
                        + "2026-10-02,09:00,2,2,280,41430.00\n"));

        mvc.perform(asAnalyst(get("/reports/generate/trading-activity-report")))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, org.hamcrest.Matchers.containsString("trading-activity-report.csv")))
                .andExpect(content().contentTypeCompatibleWith(MediaType.parseMediaType("text/csv")))
                .andExpect(content().string(
                        "trade_date,trade_hour,trade_count,unique_clients,total_quantity,total_notional\n"
                                + "2026-10-02,09:00,2,2,280,41430.00\n"));
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
