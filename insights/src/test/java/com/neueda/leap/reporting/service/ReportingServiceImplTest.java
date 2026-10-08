package com.neueda.leap.reporting.service;

import com.neueda.leap.reporting.dto.ClientActivityTrendDto;
import com.neueda.leap.reporting.dto.OverviewDto;
import com.neueda.leap.reporting.dto.TopInstrumentDto;
import com.neueda.leap.reporting.entity.TradeFillEntity;
import com.neueda.leap.reporting.model.InvalidReportDateRangeException;
import com.neueda.leap.reporting.model.ReportDateRange;
import com.neueda.leap.reporting.repository.TradeReportingRepository;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReportingServiceImplTest {

    private static final Instant FIXED_NOW = Instant.parse("2026-10-01T15:30:00Z");
    private static final Clock UTC_CLOCK = Clock.fixed(FIXED_NOW, ZoneOffset.UTC);
    private static final ReportDateRange TODAY_RANGE =
            new ReportDateRange(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 1));

    private final TradeReportingRepository repository = mock(TradeReportingRepository.class);
    private final ReportingServiceImpl service = new ReportingServiceImpl(repository, UTC_CLOCK, new DefaultResourceLoader());

    @Test
    void overviewUsesCurrentUtcDay() {
        Instant startInclusive = TODAY_RANGE.startInclusive();
        Instant endExclusive = TODAY_RANGE.endExclusive();
        TradeReportingRepository.OverviewProjection projection = mock(TradeReportingRepository.OverviewProjection.class);
        when(projection.getTradeVolumeToday()).thenReturn(1234L);
        when(projection.getActiveClientsToday()).thenReturn(87L);
        when(projection.getTradeValueToday()).thenReturn(new BigDecimal("1500000.00"));
        OverviewDto expected = new OverviewDto(1234, 87, new BigDecimal("1500000.00"));
        when(repository.summarize(startInclusive, endExclusive)).thenReturn(projection);

        assertThat(service.getOverview()).isEqualTo(expected);
        verify(repository).summarize(startInclusive, endExclusive);
    }

    @Test
    void topInstrumentsUseCurrentUtcDayAndDefaultLimit() {
        Instant startInclusive = TODAY_RANGE.startInclusive();
        Instant endExclusive = TODAY_RANGE.endExclusive();
        TradeReportingRepository.TopInstrumentProjection row = mock(TradeReportingRepository.TopInstrumentProjection.class);
        when(row.getInstrument()).thenReturn("AAPL");
        when(row.getTradeCount()).thenReturn(245L);

        List<TopInstrumentDto> expected = List.of(new TopInstrumentDto("AAPL", 245));
        when(repository.findTopInstrumentsByTradeCount(
                startInclusive,
                endExclusive,
                PageRequest.of(0, ReportingService.TOP_INSTRUMENTS_LIMIT)))
                .thenReturn(List.of(row));

        assertThat(service.getTopInstruments()).isEqualTo(expected);
        verify(repository).findTopInstrumentsByTradeCount(
                startInclusive,
                endExclusive,
                PageRequest.of(0, ReportingService.TOP_INSTRUMENTS_LIMIT));
    }

    @Test
    void trendFillsHoursWithoutTradesWithZero() {
        Instant startInclusive = TODAY_RANGE.startInclusive();
        Instant endExclusive = TODAY_RANGE.endExclusive();
        TradeFillEntity morningOne = mock(TradeFillEntity.class);
        TradeFillEntity morningTwo = mock(TradeFillEntity.class);
        TradeFillEntity afternoon = mock(TradeFillEntity.class);
        Instant morningOneFilledAt = Instant.ofEpochSecond(1790846100L);
        Instant morningTwoFilledAt = Instant.ofEpochSecond(1790848799L);
        Instant afternoonFilledAt = Instant.ofEpochSecond(1790859660L);
        when(morningOne.getFilledAt()).thenReturn(morningOneFilledAt);
        when(morningTwo.getFilledAt()).thenReturn(morningTwoFilledAt);
        when(afternoon.getFilledAt()).thenReturn(afternoonFilledAt);
        when(repository.findByFilledAtGreaterThanEqualAndFilledAtLessThanOrderByFilledAtAsc(
                startInclusive,
                endExclusive))
                .thenReturn(List.of(morningOne, morningTwo, afternoon));

        List<ClientActivityTrendDto> trend = service.getClientActivityTrend();

        assertThat(trend).hasSize(24);
        assertThat(trend.get(0)).isEqualTo(new ClientActivityTrendDto("00:00", 0));
        assertThat(trend.get(9)).isEqualTo(new ClientActivityTrendDto("09:00", 2));
        assertThat(trend.get(13)).isEqualTo(new ClientActivityTrendDto("13:00", 1));
        assertThat(trend.get(23)).isEqualTo(new ClientActivityTrendDto("23:00", 0));
        verify(repository).findByFilledAtGreaterThanEqualAndFilledAtLessThanOrderByFilledAtAsc(
                startInclusive,
                endExclusive);
    }

    @Test
    void reportGenerationEndpointsReturnSharedPlaceholder() {
        String instrumentCsv = csvBody(service.generateInstrumentReport());
        String segmentCsv = csvBody(service.generateClientSegmentReport());
        String activityCsv = csvBody(service.generateTradingActivityReport());

        assertThat(instrumentCsv).startsWith("instrument_symbol,instrument_name,asset_class,market_code,trade_count,total_quantity,total_notional,average_execution_price");
        assertThat(instrumentCsv).contains("AAPL,Apple Inc.,COMMON_STOCK,NASDAQ,4,500,50780.00,101.56");

        assertThat(segmentCsv).startsWith("client_segment,trade_count,unique_clients,total_quantity,total_notional");
        assertThat(segmentCsv).contains("ADVANCED,6,2,100343,360265.50");
        assertThat(segmentCsv).contains("NOVICE,6,2,150560,270770.00");

        assertThat(activityCsv).startsWith("trade_date,trade_hour,trade_count,unique_clients,total_quantity,total_notional");
        assertThat(activityCsv).contains("2026-10-02,09:00,2,2,150,41430.00");
        assertThat(activityCsv.lines()).hasSize(11);
    }

    @Test
    void dateRangeIsInclusiveAndUtcBounded() {
        ReportDateRange range = new ReportDateRange(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30));

        assertThat(range.startInclusive()).isEqualTo(Instant.parse("2026-09-01T00:00:00Z"));
        assertThat(range.endExclusive()).isEqualTo(Instant.parse("2026-10-01T00:00:00Z"));
    }

    @Test
    void dateRangeRejectsInvalidBounds() {
        LocalDate start = LocalDate.of(2026, 1, 1);

        assertThatThrownBy(() -> new ReportDateRange(start, start.minusDays(1)))
                .isInstanceOf(InvalidReportDateRangeException.class);
        assertThatThrownBy(() -> new ReportDateRange(start, start.plusDays(ReportDateRange.MAX_DAYS)))
                .isInstanceOf(InvalidReportDateRangeException.class);
        assertThatThrownBy(() -> new ReportDateRange(null, start))
                .isInstanceOf(InvalidReportDateRangeException.class);
        assertThat(new ReportDateRange(start, start.plusDays(ReportDateRange.MAX_DAYS - 1))).isNotNull();
    }

    private String csvBody(ResponseEntity<Resource> response) {
        try {
            return new String(((ByteArrayResource) response.getBody()).getByteArray(), StandardCharsets.UTF_8);
        } catch (ClassCastException ex) {
            throw new IllegalStateException("Expected a ByteArrayResource body", ex);
        }
    }

    @Test
    void missingOverviewAndNullAggregatesReturnZeroMetrics() {
        assertThat(service.getOverview()).isEqualTo(new OverviewDto(0, 0, new BigDecimal("0.00")));
        when(repository.summarize(any(), any())).thenReturn(mock(TradeReportingRepository.OverviewProjection.class));
        assertThat(service.getOverview()).isEqualTo(new OverviewDto(0, 0, new BigDecimal("0.00")));
    }

    private ReportingServiceImpl csvService(String csv) {
        var loader = mock(org.springframework.core.io.ResourceLoader.class);
        when(loader.getResource("classpath:reports/trades.csv"))
                .thenReturn(new ByteArrayResource(csv.getBytes(StandardCharsets.UTF_8)));
        return new ReportingServiceImpl(repository, UTC_CLOCK, loader);
    }

    private String csvHeader() throws java.io.IOException {
        try (var stream = new DefaultResourceLoader().getResource("classpath:reports/trades.csv").getInputStream()) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8).lines().findFirst().orElseThrow();
        }
    }

    @Test
    void quotedInstrumentNamesRoundTripThroughReport() throws Exception {
        String row = "f,o,2026-10-01T12:00:00Z,i,AAPL,\"Apple, \"\"Special\"\"\",EQUITY,NASDAQ,u,email,a,001,ACTIVE,ADVANCED,BUY,2,10.25";
        var report = csvService(csvHeader() + "\n\n" + row + "\n").generateInstrumentReport();
        assertThat(csvBody(report)).contains("AAPL,\"Apple, \"\"Special\"\"\",EQUITY,NASDAQ,1,2,20.50,10.25");
        assertThat(report.getHeaders().getContentLength()).isEqualTo(report.getBody().contentLength());
    }

    @Test
    void quoteAtEndOfLastColumnAndZeroQuantityAreHandled() throws Exception {
        String row = "f,o,2026-10-01T12:00:00Z,i,AAPL,Apple,EQUITY,NASDAQ,u,email,a,001,ACTIVE,ADVANCED,BUY,0,\"10.25\"";
        assertThat(csvBody(csvService(csvHeader() + "\n" + row).generateInstrumentReport()))
                .contains("AAPL,Apple,EQUITY,NASDAQ,1,0,0.00,0.00");
    }

    @Test
    void malformedDatasetsFailClearly() throws Exception {
        assertThatThrownBy(() -> csvService("").generateInstrumentReport()).hasMessageContaining("is empty");
        assertThatThrownBy(() -> csvService("wrong,header").generateInstrumentReport()).hasMessageContaining("header");
        var shortRow = csvService(csvHeader() + "\nmissing,columns");
        assertThatThrownBy(shortRow::generateInstrumentReport).hasMessageContaining("column count");
        var loader = mock(org.springframework.core.io.ResourceLoader.class);
        var resource = mock(Resource.class);
        when(loader.getResource(any())).thenReturn(resource);
        var broken = new ReportingServiceImpl(repository, UTC_CLOCK, loader);
        assertThatThrownBy(broken::generateInstrumentReport).hasMessageContaining("not found");
        when(resource.exists()).thenReturn(true);
        when(resource.getInputStream()).thenThrow(new java.io.IOException("read failure"));
        assertThatThrownBy(broken::generateInstrumentReport).hasCauseInstanceOf(java.io.IOException.class);
    }
}
