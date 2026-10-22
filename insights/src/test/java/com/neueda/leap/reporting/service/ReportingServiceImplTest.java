package com.neueda.leap.reporting.service;

import com.neueda.leap.reporting.dto.ClientActivityTrendDto;
import com.neueda.leap.reporting.dto.OverviewDto;
import com.neueda.leap.reporting.dto.TopInstrumentDto;
import com.neueda.leap.reporting.entity.TradeFillEntity;
import com.neueda.leap.reporting.model.InvalidReportDateRangeException;
import com.neueda.leap.reporting.model.MarketDay;
import com.neueda.leap.reporting.model.ReportDateRange;
import com.neueda.leap.reporting.repository.TradeReportingRepository;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

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
    /** 15:30 UTC is 11:30 in New York, so today is October 1 there too. */
    private static final MarketDay TODAY_RANGE = new MarketDay(LocalDate.of(2026, 10, 1));
    private static final ReportDateRange FULL_RANGE =
            new ReportDateRange(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 10, 31));

    private final TradeReportingRepository repository = mock(TradeReportingRepository.class);
    private final ReplicaDatabase replica = new ReplicaDatabase();
    private final ReportingServiceImpl service = new ReportingServiceImpl(repository, UTC_CLOCK, replica.dataset());

    /** A small trade book on the replica; New York is UTC-4 in October. */
    ReportingServiceImplTest() {
        replica.instrument("AAPL", "Apple Inc.", "COMMON_STOCK", "NASDAQ");
        replica.instrument("JPM", "JPMorgan Chase & Co.", "COMMON_STOCK", "NYSE");
        replica.instrument("KO", "The Coca-Cola Company", "COMMON_STOCK", "NYSE");
        UUID maya = UUID.randomUUID();
        UUID ada = UUID.randomUUID();
        UUID sam = UUID.randomUUID();
        replica.account(maya, "Maya", "Chen", "maya@example.test", "NT-DEMO-0001", "Maya", "ACTIVE", "NOVICE");
        replica.account(ada, "Ada", "Vance", "ada@example.test", "NT-DEMO-0002", "Ada", "ACTIVE", "ADVANCED");
        replica.account(sam, "Sam", "Okafor", "sam@example.test", "NT-DEMO-0003", "Sam", "ACTIVE", "ADVANCED");
        replica.fill(maya, "AAPL", "BUY", 10, "220.00", "2026-10-15T14:05:00Z");
        replica.fill(ada, "AAPL", "BUY", 5, "230.00", "2026-10-16T14:10:00Z");
        replica.fill(ada, "AAPL", "SELL", 2, "235.00", "2026-10-16T14:40:00Z");
        replica.fill(sam, "JPM", "BUY", 4, "300.00", "2026-10-16T18:00:00Z");
        // 03:30 UTC on the 17th is still the 16th (23:30) in New York.
        replica.fill(maya, "KO", "SELL", 3, "68.50", "2026-10-17T03:30:00Z");
        replica.fill(sam, "KO", "BUY", 1, "70.00", "2026-10-17T14:00:00Z");
    }

    @Test
    void overviewUsesTodaysNewYorkTradingDay() {
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
    void topInstrumentsUseTodaysNewYorkTradingDayAndDefaultLimit() {
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
    void trendCountsNewYorkHoursAndFillsHoursWithoutTradesWithZero() {
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

        // 09:15 and 09:59 UTC are 05:00 in New York (EDT); 13:01 UTC is 09:00.
        assertThat(trend)
                .hasSize(24)
                .contains(new ClientActivityTrendDto("00:00", 0), atIndex(0))
                .contains(new ClientActivityTrendDto("05:00", 2), atIndex(5))
                .contains(new ClientActivityTrendDto("09:00", 1), atIndex(9))
                .contains(new ClientActivityTrendDto("13:00", 0), atIndex(13))
                .contains(new ClientActivityTrendDto("23:00", 0), atIndex(23));
        verify(repository).findByFilledAtGreaterThanEqualAndFilledAtLessThanOrderByFilledAtAsc(
                startInclusive,
                endExclusive);
    }

    @Test
    void reportsCoveringTheWholeBookAggregateEveryTrade() {
        String instrumentCsv = csvBody(service.generateInstrumentReport(FULL_RANGE));
        String segmentCsv = csvBody(service.generateClientSegmentReport(FULL_RANGE));
        String activityCsv = csvBody(service.generateTradingActivityReport(FULL_RANGE));

        // Most traded first; 3820.00 / 17 shares = 224.71 and 275.50 / 4 = 68.88 (half up).
        assertThat(instrumentCsv.lines()).containsExactly(
                "instrument_symbol,instrument_name,asset_class,market_code,trade_count,total_quantity,total_notional,average_execution_price",
                "AAPL,Apple Inc.,COMMON_STOCK,NASDAQ,3,17,3820.00,224.71",
                "KO,The Coca-Cola Company,COMMON_STOCK,NYSE,2,4,275.50,68.88",
                "JPM,JPMorgan Chase & Co.,COMMON_STOCK,NYSE,1,4,1200.00,300.00");

        assertThat(segmentCsv.lines()).containsExactly(
                "client_segment,trade_count,unique_clients,total_quantity,total_notional",
                "ADVANCED,4,2,12,2890.00",
                "NOVICE,2,1,13,2405.50");

        // Grouped by New York date and hour: 14:10 UTC is 10:00, 03:30 UTC on the 17th is 23:00 on the 16th.
        assertThat(activityCsv.lines()).containsExactly(
                "trade_date,trade_hour,trade_count,unique_clients,total_quantity,total_notional",
                "2026-10-15,10:00,1,1,10,2200.00",
                "2026-10-16,10:00,2,1,7,1620.00",
                "2026-10-16,14:00,1,1,4,1200.00",
                "2026-10-16,23:00,1,1,3,205.50",
                "2026-10-17,10:00,1,1,1,70.00");
    }

    @Test
    void buySellBalanceSplitsSidesPerInstrumentWithNetBuyersFirst() {
        ResponseEntity<Resource> report = service.generateBuySellBalanceReport(FULL_RANGE);

        assertThat(csvBody(report).lines()).containsExactly(
                "instrument_symbol,instrument_name,asset_class,market_code,"
                        + "buy_trade_count,sell_trade_count,buy_quantity,sell_quantity,net_quantity,"
                        + "buy_notional,sell_notional,net_notional",
                "AAPL,Apple Inc.,COMMON_STOCK,NASDAQ,2,1,15,2,13,3350.00,470.00,2880.00",
                "JPM,JPMorgan Chase & Co.,COMMON_STOCK,NYSE,1,0,4,0,4,1200.00,0.00,1200.00",
                "KO,The Coca-Cola Company,COMMON_STOCK,NYSE,1,1,1,3,-2,70.00,205.50,-135.50");
        assertThat(report.getHeaders().getContentDisposition().getFilename())
                .isEqualTo("buy-sell-balance-report_2026-09-01_2026-10-31.csv");
    }

    @Test
    void buySellBalanceShowsNetSellersLastWithNegativeNets() {
        ReplicaDatabase book = new ReplicaDatabase();
        book.instrument("AAA", "Alpha", "COMMON_STOCK", "NYSE");
        book.instrument("BBB", "Beta", "COMMON_STOCK", "NASDAQ");
        UUID first = account(book, "001");
        UUID second = account(book, "002");
        book.fill(first, "AAA", "BUY", 10, "5.00", "2026-10-01T14:00:00Z");
        book.fill(second, "AAA", "SELL", 25, "6.00", "2026-10-01T15:00:00Z");
        book.fill(first, "BBB", "BUY", 3, "2.50", "2026-10-01T16:00:00Z");
        book.fill(first, "BBB", "BUY", 99, "2.50", "2026-10-02T16:00:00Z");
        ReportDateRange octoberFirst = new ReportDateRange(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 1));

        assertThat(csvBody(serviceOver(book).generateBuySellBalanceReport(octoberFirst)).lines().skip(1).toList())
                .containsExactly(
                        "BBB,Beta,COMMON_STOCK,NASDAQ,1,0,3,0,3,7.50,0.00,7.50",
                        "AAA,Alpha,COMMON_STOCK,NYSE,1,1,10,25,-15,50.00,150.00,-100.00");
    }

    @Test
    void buySellBalanceRejectsUnknownSides() {
        ReplicaDatabase book = new ReplicaDatabase();
        book.instrument("AAPL", "Apple", "COMMON_STOCK", "NASDAQ");
        book.fill(account(book, "001"), "AAPL", "SHORT", 1, "1.00", "2026-10-01T12:00:00Z");
        var unknownSide = serviceOver(book);

        assertThatThrownBy(() -> unknownSide.generateBuySellBalanceReport(FULL_RANGE))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Unexpected side");
    }

    @Test
    void reportsOnlyIncludeTradesInsideTheNewYorkDateRange() {
        ReportDateRange october16 = new ReportDateRange(LocalDate.of(2026, 10, 16), LocalDate.of(2026, 10, 16));

        // The 15th and the 17th's 14:00 UTC fill are left out; 03:30 UTC on the 17th counts for the 16th.
        List<String> activityRows = csvBody(service.generateTradingActivityReport(october16)).lines().skip(1).toList();
        assertThat(activityRows).hasSize(3).allMatch(row -> row.startsWith("2026-10-16,"));
        assertThat(activityRows.stream().mapToLong(row -> Long.parseLong(row.split(",")[2])).sum()).isEqualTo(4);

        List<String> segmentRows = csvBody(service.generateClientSegmentReport(october16)).lines().skip(1).toList();
        assertThat(segmentRows).containsExactly("ADVANCED,3,2,11,2820.00", "NOVICE,1,1,3,205.50");
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
    void dateRangeIsInclusiveAndBoundedByNewYorkMidnight() {
        ReportDateRange range = new ReportDateRange(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30));

        assertThat(range.startInclusive()).isEqualTo(Instant.parse("2026-09-01T04:00:00Z"));
        assertThat(range.endExclusive()).isEqualTo(Instant.parse("2026-10-01T04:00:00Z"));
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

    private ReportingServiceImpl serviceOver(ReplicaDatabase book) {
        return new ReportingServiceImpl(repository, UTC_CLOCK, book.dataset());
    }

    private static UUID account(ReplicaDatabase book, String number) {
        UUID account = UUID.randomUUID();
        book.account(account, "Test", number, number + "@example.test", number, "account", "ACTIVE", "NOVICE");
        return account;
    }

    @Test
    void instrumentNamesWithCommasAndQuotesAreEscapedInTheReport() throws java.io.IOException {
        ReplicaDatabase book = new ReplicaDatabase();
        book.instrument("AAPL", "Apple, \"Special\"", "EQUITY", "NASDAQ");
        book.fill(account(book, "001"), "AAPL", "BUY", 2, "10.25", "2026-10-01T12:00:00Z");

        var report = serviceOver(book).generateInstrumentReport(FULL_RANGE);

        assertThat(csvBody(report)).contains("AAPL,\"Apple, \"\"Special\"\"\",EQUITY,NASDAQ,1,2,20.50,10.25");
        assertThat(report.getHeaders().getContentLength()).isEqualTo(report.getBody().contentLength());
    }

    @Test
    void aZeroQuantityFillHasZeroValueAndAveragePrice() {
        ReplicaDatabase book = new ReplicaDatabase();
        book.instrument("AAPL", "Apple", "EQUITY", "NASDAQ");
        book.fill(account(book, "001"), "AAPL", "BUY", 0, "10.25", "2026-10-01T12:00:00Z");

        assertThat(csvBody(serviceOver(book).generateInstrumentReport(FULL_RANGE)))
                .contains("AAPL,Apple,EQUITY,NASDAQ,1,0,0.00,0.00");
    }

    @Test
    void emptyReplicaGivesHeaderOnlyReport() {
        String body = csvBody(serviceOver(new ReplicaDatabase()).generateInstrumentReport(FULL_RANGE));
        assertThat(body.lines()).hasSize(1);
    }

    @Test
    void replicaFailureIsNotHidden() {
        TradeDataset dataset = mock(TradeDataset.class);
        when(dataset.trades()).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("replica down"));
        var broken = new ReportingServiceImpl(repository, UTC_CLOCK, dataset);
        assertThatThrownBy(() -> broken.generateInstrumentReport(FULL_RANGE)).hasMessageContaining("replica down");
    }
}
