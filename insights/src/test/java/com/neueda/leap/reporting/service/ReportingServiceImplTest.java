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
import static org.assertj.core.data.Index.atIndex;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReportingServiceImplTest {

    private static final Instant FIXED_NOW = Instant.parse("2026-10-01T15:30:00Z");
    private static final Clock UTC_CLOCK = Clock.fixed(FIXED_NOW, ZoneOffset.UTC);
    private static final ReportDateRange TODAY_RANGE =
            new ReportDateRange(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 1));
    private static final ReportDateRange FULL_RANGE =
            new ReportDateRange(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 10, 31));

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

        assertThat(trend)
                .hasSize(24)
                .contains(new ClientActivityTrendDto("00:00", 0), atIndex(0))
                .contains(new ClientActivityTrendDto("09:00", 2), atIndex(9))
                .contains(new ClientActivityTrendDto("13:00", 1), atIndex(13))
                .contains(new ClientActivityTrendDto("23:00", 0), atIndex(23));
        verify(repository).findByFilledAtGreaterThanEqualAndFilledAtLessThanOrderByFilledAtAsc(
                startInclusive,
                endExclusive);
    }

    @Test
    void reportsCoveringTheWholeDatasetAggregateEveryTrade() {
        String instrumentCsv = csvBody(service.generateInstrumentReport(FULL_RANGE));
        String segmentCsv = csvBody(service.generateClientSegmentReport(FULL_RANGE));
        String activityCsv = csvBody(service.generateTradingActivityReport(FULL_RANGE));

        assertThat(instrumentCsv)
                .startsWith("instrument_symbol,instrument_name,asset_class,market_code,trade_count,total_quantity,total_notional,average_execution_price")
                .contains("AAPL,Apple Inc.,COMMON_STOCK,NASDAQ,7,372,82953.90,222.99")
                .contains("JPM,JPMorgan Chase & Co.,COMMON_STOCK,NYSE,4,168,50701.61,301.80")
                .hasLineCount(34);

        assertThat(segmentCsv)
                .startsWith("client_segment,trade_count,unique_clients,total_quantity,total_notional")
                .contains("ADVANCED,78,7,5672,1244086.96")
                .contains("NOVICE,69,7,737,92219.81");

        assertThat(activityCsv)
                .startsWith("trade_date,trade_hour,trade_count,unique_clients,total_quantity,total_notional")
                .contains("2026-10-16,14:00,8,8,286,68966.56")
                .hasLineCount(68);
    }

    @Test
    void buySellBalanceSplitsSidesPerInstrumentWithNetBuyersFirst() {
        ResponseEntity<Resource> report = service.generateBuySellBalanceReport(FULL_RANGE);
        List<String> lines = csvBody(report).lines().toList();

        assertThat(lines.get(0)).isEqualTo("instrument_symbol,instrument_name,asset_class,market_code,"
                + "buy_trade_count,sell_trade_count,buy_quantity,sell_quantity,net_quantity,"
                + "buy_notional,sell_notional,net_notional");
        assertThat(lines).hasSize(34)
                .contains("KO,The Coca-Cola Company,COMMON_STOCK,NYSE,4,0,727,0,727,49295.24,0.00,49295.24", atIndex(1))
                .contains("NVDA,NVIDIA Corporation,COMMON_STOCK,NASDAQ,9,7,553,151,402,95364.81,26498.74,68866.07", atIndex(2))
                .contains("INTC,Intel Corporation,COMMON_STOCK,NASDAQ,1,2,35,35,0,1255.80,1262.64,-6.84", atIndex(33));
        // Count columns are read from the end because quoted instrument names can contain commas.
        long trades = lines.stream().skip(1)
                .map(line -> line.split(","))
                .mapToLong(columns -> Long.parseLong(columns[columns.length - 8]) + Long.parseLong(columns[columns.length - 7]))
                .sum();
        assertThat(trades).isEqualTo(147);
        assertThat(report.getHeaders().getContentDisposition().getFilename())
                .isEqualTo("buy-sell-balance-report_2026-09-01_2026-10-31.csv");
    }

    @Test
    void buySellBalanceShowsNetSellersLastWithNegativeNets() throws Exception {
        String csv = csvHeader() + "\n"
                + "f1,o1,2026-10-01T14:00:00Z,i,AAA,Alpha,COMMON_STOCK,NYSE,u1,e,a1,001,ACTIVE,NOVICE,BUY,10,5.00\n"
                + "f2,o2,2026-10-01T15:00:00Z,i,AAA,Alpha,COMMON_STOCK,NYSE,u2,e,a2,002,ACTIVE,NOVICE,SELL,25,6.00\n"
                + "f3,o3,2026-10-01T16:00:00Z,j,BBB,Beta,COMMON_STOCK,NASDAQ,u1,e,a1,001,ACTIVE,NOVICE,BUY,3,2.50\n"
                + "f4,o4,2026-10-02T16:00:00Z,j,BBB,Beta,COMMON_STOCK,NASDAQ,u1,e,a1,001,ACTIVE,NOVICE,BUY,99,2.50\n";
        ReportDateRange octoberFirst = new ReportDateRange(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 1));

        assertThat(csvBody(csvService(csv).generateBuySellBalanceReport(octoberFirst)).lines().skip(1).toList())
                .containsExactly(
                        "BBB,Beta,COMMON_STOCK,NASDAQ,1,0,3,0,3,7.50,0.00,7.50",
                        "AAA,Alpha,COMMON_STOCK,NYSE,1,1,10,25,-15,50.00,150.00,-100.00");
    }

    @Test
    void buySellBalanceRejectsUnknownSides() throws Exception {
        var unknownSide = csvService(csvHeader()
                + "\nf,o,2026-10-01T12:00:00Z,i,AAPL,Apple,COMMON_STOCK,NASDAQ,u,e,a,001,ACTIVE,NOVICE,SHORT,1,1.00");

        assertThatThrownBy(() -> unknownSide.generateBuySellBalanceReport(FULL_RANGE))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Unexpected side");
    }

    @Test
    void reportsOnlyIncludeTradesInsideTheUtcDateRange() {
        ReportDateRange anchorDay = new ReportDateRange(LocalDate.of(2026, 10, 16), LocalDate.of(2026, 10, 16));

        List<String> activityRows = csvBody(service.generateTradingActivityReport(anchorDay)).lines().skip(1).toList();
        assertThat(activityRows).isNotEmpty().allMatch(row -> row.startsWith("2026-10-16,"));
        assertThat(activityRows.stream().mapToLong(row -> Long.parseLong(row.split(",")[2])).sum()).isEqualTo(60);

        List<String> segmentRows = csvBody(service.generateClientSegmentReport(anchorDay)).lines().skip(1).toList();
        assertThat(segmentRows.stream().mapToLong(row -> Long.parseLong(row.split(",")[1])).sum()).isEqualTo(60);
    }

    @Test
    void rangeWithoutTradesReturnsHeaderOnlyWithDatedFilename() {
        ReportDateRange empty = new ReportDateRange(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31));

        ResponseEntity<Resource> report = service.generateInstrumentReport(empty);

        assertThat(csvBody(report)).startsWith("instrument_symbol,").hasLineCount(1);
        assertThat(report.getHeaders().getContentDisposition().getFilename())
                .isEqualTo("instrument-report_2026-01-01_2026-01-31.csv");
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
        LocalDate beforeStart = start.minusDays(1);
        LocalDate beyondMaximumRange = start.plusDays(ReportDateRange.MAX_DAYS);

        assertThatThrownBy(() -> new ReportDateRange(start, beforeStart))
                .isInstanceOf(InvalidReportDateRangeException.class);
        assertThatThrownBy(() -> new ReportDateRange(start, beyondMaximumRange))
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
    void missingOverviewReturnsZeroMetrics() {
        assertThat(service.getOverview()).isEqualTo(new OverviewDto(0, 0, new BigDecimal("0.00")));
    }

    @Test
    void nullOverviewAggregatesReturnZeroMetrics() {
        var projection = mock(TradeReportingRepository.OverviewProjection.class);
        when(repository.summarize(any(), any())).thenReturn(projection);
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
        var report = csvService(csvHeader() + "\n\n" + row + "\n").generateInstrumentReport(FULL_RANGE);
        assertThat(csvBody(report)).contains("AAPL,\"Apple, \"\"Special\"\"\",EQUITY,NASDAQ,1,2,20.50,10.25");
        assertThat(report.getHeaders().getContentLength()).isEqualTo(report.getBody().contentLength());
    }

    @Test
    void quoteAtEndOfLastColumnAndZeroQuantityAreHandled() throws Exception {
        String row = "f,o,2026-10-01T12:00:00Z,i,AAPL,Apple,EQUITY,NASDAQ,u,email,a,001,ACTIVE,ADVANCED,BUY,0,\"10.25\"";
        assertThat(csvBody(csvService(csvHeader() + "\n" + row).generateInstrumentReport(FULL_RANGE)))
                .contains("AAPL,Apple,EQUITY,NASDAQ,1,0,0.00,0.00");
    }

    @Test
    void malformedDatasetsFailClearly() throws Exception {
        var emptyDataset = csvService("");
        var invalidHeader = csvService("wrong,header");
        assertThatThrownBy(() -> emptyDataset.generateInstrumentReport(FULL_RANGE)).hasMessageContaining("is empty");
        assertThatThrownBy(() -> invalidHeader.generateInstrumentReport(FULL_RANGE)).hasMessageContaining("header");
        var shortRow = csvService(csvHeader() + "\nmissing,columns");
        assertThatThrownBy(() -> shortRow.generateInstrumentReport(FULL_RANGE)).hasMessageContaining("column count");
        var loader = mock(org.springframework.core.io.ResourceLoader.class);
        var resource = mock(Resource.class);
        when(loader.getResource(any())).thenReturn(resource);
        var broken = new ReportingServiceImpl(repository, UTC_CLOCK, loader);
        assertThatThrownBy(() -> broken.generateInstrumentReport(FULL_RANGE)).hasMessageContaining("not found");
        when(resource.exists()).thenReturn(true);
        when(resource.getInputStream()).thenThrow(new java.io.IOException("read failure"));
        assertThatThrownBy(() -> broken.generateInstrumentReport(FULL_RANGE)).hasCauseInstanceOf(java.io.IOException.class);
    }
}
