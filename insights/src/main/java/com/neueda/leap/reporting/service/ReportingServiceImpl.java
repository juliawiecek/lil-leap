package com.neueda.leap.reporting.service;

import com.neueda.leap.reporting.dto.ClientActivityTrendDto;
import com.neueda.leap.reporting.dto.OverviewDto;
import com.neueda.leap.reporting.dto.TopInstrumentDto;
import com.neueda.leap.reporting.entity.TradeFillEntity;
import com.neueda.leap.reporting.model.MarketDay;
import com.neueda.leap.reporting.model.ReportDateRange;
import com.neueda.leap.reporting.repository.TradeReportingRepository;
import com.neueda.leap.reporting.service.TradeDataset.Trade;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * Default {@link ReportingService} for current-day insights and file-based BR-16 report generation.
 */
@Service
public class ReportingServiceImpl implements ReportingService {

    private static final String INSTRUMENT_REPORT_NAME = "instrument-report";
    private static final String CLIENT_SEGMENT_REPORT_NAME = "client-segment-report";
    private static final String TRADING_ACTIVITY_REPORT_NAME = "trading-activity-report";
    private static final String BUY_SELL_BALANCE_REPORT_NAME = "buy-sell-balance-report";
    private static final String BUY_SIDE = "BUY";
    private static final String SELL_SIDE = "SELL";
    private static final String REPORTING_DATASET_ROW = "Reporting dataset row";
    private static final String HEADER_TRADE_COUNT = "trade_count";
    private static final String HEADER_TOTAL_QUANTITY = "total_quantity";
    private static final String HEADER_TOTAL_NOTIONAL = "total_notional";

    private static final List<String> INSTRUMENT_REPORT_HEADERS = List.of(
            "instrument_symbol",
            "instrument_name",
            "asset_class",
            "market_code",
            HEADER_TRADE_COUNT,
            HEADER_TOTAL_QUANTITY,
            HEADER_TOTAL_NOTIONAL,
            "average_execution_price");

    private static final List<String> CLIENT_SEGMENT_REPORT_HEADERS = List.of(
            "client_segment",
            HEADER_TRADE_COUNT,
            "unique_clients",
            HEADER_TOTAL_QUANTITY,
            HEADER_TOTAL_NOTIONAL);

    private static final List<String> TRADING_ACTIVITY_REPORT_HEADERS = List.of(
            "trade_date",
            "trade_hour",
            HEADER_TRADE_COUNT,
            "unique_clients",
            HEADER_TOTAL_QUANTITY,
            HEADER_TOTAL_NOTIONAL);

    private static final List<String> BUY_SELL_BALANCE_REPORT_HEADERS = List.of(
            "instrument_symbol",
            "instrument_name",
            "asset_class",
            "market_code",
            "buy_trade_count",
            "sell_trade_count",
            "buy_quantity",
            "sell_quantity",
            "net_quantity",
            "buy_notional",
            "sell_notional",
            "net_notional");

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final BigDecimal ZERO_MONEY = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    private static final MediaType TEXT_CSV_UTF8 = new MediaType("text", "csv", StandardCharsets.UTF_8);

    private final TradeReportingRepository repository;
    private final Clock clock;
    private final TradeDataset dataset;

    /**
     * Creates the reporting service.
     *
     * @param repository existing read-only reporting repository used by the dashboard insights endpoints
     * @param clock source of the current instant, used to find today's Central-time day
     * @param dataset every fill, read from the reporting replica (BR-16)
     */
    public ReportingServiceImpl(TradeReportingRepository repository, Clock clock, TradeDataset dataset) {
        this.repository = repository;
        this.clock = clock;
        this.dataset = dataset;
    }

    @Override
    public OverviewDto getOverview() {
        MarketDay today = MarketDay.today(clock);
        TradeReportingRepository.OverviewProjection overview =
                repository.summarize(today.startInclusive(), today.endExclusive());

        return new OverviewDto(
                defaultLong(overview == null ? null : overview.getTradeVolumeToday()),
                defaultLong(overview == null ? null : overview.getActiveClientsToday()),
                scaleMoney(overview == null ? null : overview.getTradeValueToday()));
    }

    @Override
    public List<TopInstrumentDto> getTopInstruments() {
        MarketDay today = MarketDay.today(clock);
        return repository.findTopInstrumentsByTradeCount(
                        today.startInclusive(),
                        today.endExclusive(),
                        PageRequest.of(0, TOP_INSTRUMENTS_LIMIT))
                .stream()
                .map(item -> new TopInstrumentDto(item.getInstrument(), defaultLong(item.getTradeCount())))
                .toList();
    }

    @Override
    public List<ClientActivityTrendDto> getClientActivityTrend() {
        MarketDay today = MarketDay.today(clock);
        Map<String, Long> countsByHour = repository
                .findByFilledAtGreaterThanEqualAndFilledAtLessThanOrderByFilledAtAsc(
                        today.startInclusive(),
                        today.endExclusive())
                .stream()
                .map(TradeFillEntity::getFilledAt)
                .map(MarketDay::hourLabel)
                .collect(Collectors.toMap(
                        label -> label,
                        ignored -> 1L,
                        Long::sum,
                        LinkedHashMap::new));

        return IntStream.range(0, 24)
                .mapToObj(hour -> String.format(Locale.ROOT, "%02d:00", hour))
                .map(hourLabel -> new ClientActivityTrendDto(hourLabel, countsByHour.getOrDefault(hourLabel, 0L)))
                .toList();
    }

    @Override
    public ResponseEntity<Resource> generateInstrumentReport(ReportDateRange range) {
        List<Trade> trades = loadTrades(range);
        List<List<String>> rows = aggregateByInstrument(trades).stream()
                .map(this::instrumentReportRow)
                .toList();
        return buildCsvAttachment(reportFilename(INSTRUMENT_REPORT_NAME, range), INSTRUMENT_REPORT_HEADERS, rows);
    }

    @Override
    public ResponseEntity<Resource> generateClientSegmentReport(ReportDateRange range) {
        List<Trade> trades = loadTrades(range);
        List<List<String>> rows = aggregateByClientSegment(trades).stream()
                .map(this::clientSegmentReportRow)
                .toList();
        return buildCsvAttachment(reportFilename(CLIENT_SEGMENT_REPORT_NAME, range), CLIENT_SEGMENT_REPORT_HEADERS, rows);
    }

    @Override
    public ResponseEntity<Resource> generateTradingActivityReport(ReportDateRange range) {
        List<Trade> trades = loadTrades(range);
        List<List<String>> rows = aggregateByTradingActivity(trades).stream()
                .map(this::tradingActivityReportRow)
                .toList();
        return buildCsvAttachment(reportFilename(TRADING_ACTIVITY_REPORT_NAME, range), TRADING_ACTIVITY_REPORT_HEADERS, rows);
    }

    @Override
    public ResponseEntity<Resource> generateBuySellBalanceReport(ReportDateRange range) {
        List<Trade> trades = loadTrades(range);
        List<List<String>> rows = aggregateBuySellBalance(trades).stream()
                .map(this::buySellBalanceReportRow)
                .toList();
        return buildCsvAttachment(reportFilename(BUY_SELL_BALANCE_REPORT_NAME, range), BUY_SELL_BALANCE_REPORT_HEADERS, rows);
    }

    private String reportFilename(String reportName, ReportDateRange range) {
        return reportName + "_" + DATE_FORMATTER.format(range.startDate())
                + "_" + DATE_FORMATTER.format(range.endDate()) + ".csv";
    }

    private long defaultLong(Long value) {
        return value == null ? 0L : value;
    }

    private BigDecimal scaleMoney(BigDecimal value) {
        return value == null ? ZERO_MONEY : value.setScale(2, RoundingMode.HALF_UP);
    }

    private ResponseEntity<Resource> buildCsvAttachment(String filename, List<String> headers, List<List<String>> rows) {
        String csv = toCsv(headers, rows);
        ByteArrayResource resource = new ByteArrayResource(csv.getBytes(StandardCharsets.UTF_8));

        return ResponseEntity.ok()
                .contentType(TEXT_CSV_UTF8)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(filename, StandardCharsets.UTF_8).build().toString())
                .contentLength(resource.contentLength())
                .body(resource);
    }

    private List<Trade> loadTrades(ReportDateRange range) {
        Instant startInclusive = range.startInclusive();
        Instant endExclusive = range.endExclusive();
        return dataset.trades().stream()
                .filter(trade -> !trade.filledAt().isBefore(startInclusive) && trade.filledAt().isBefore(endExclusive))
                .toList();
    }

    private List<InstrumentAggregateRow> aggregateByInstrument(List<Trade> trades) {
        Map<InstrumentKey, AggregateBucket> aggregated = new HashMap<>();
        for (Trade trade : trades) {
            aggregated.computeIfAbsent(instrumentKey(trade), ignored -> new AggregateBucket()).accept(trade);
        }

        return aggregated.entrySet().stream()
                .sorted(Comparator
                        .comparing((Map.Entry<InstrumentKey, AggregateBucket> entry) -> entry.getValue().tradeCount())
                        .reversed()
                        .thenComparing(entry -> entry.getKey().instrumentSymbol()))
                .map(entry -> new InstrumentAggregateRow(
                        entry.getKey().instrumentSymbol(),
                        entry.getKey().instrumentName(),
                        entry.getKey().assetClass(),
                        entry.getKey().marketCode(),
                        entry.getValue().tradeCount(),
                        entry.getValue().totalQuantity(),
                        entry.getValue().totalNotional()))
                .toList();
    }

    private List<ClientSegmentAggregateRow> aggregateByClientSegment(List<Trade> trades) {
        Map<String, AggregateBucket> aggregated = new HashMap<>();
        for (Trade trade : trades) {
            aggregated.computeIfAbsent(trade.traderLevel(), ignored -> new AggregateBucket()).accept(trade);
        }

        return aggregated.entrySet().stream()
                .sorted(Comparator
                        .comparing((Map.Entry<String, AggregateBucket> entry) -> entry.getValue().tradeCount())
                        .reversed()
                        .thenComparing(Map.Entry::getKey))
                .map(entry -> new ClientSegmentAggregateRow(
                        entry.getKey(),
                        entry.getValue().tradeCount(),
                        entry.getValue().uniqueClients().size(),
                        entry.getValue().totalQuantity(),
                        entry.getValue().totalNotional()))
                .toList();
    }

    private List<TradingActivityAggregateRow> aggregateByTradingActivity(List<Trade> trades) {
        Map<ActivityKey, AggregateBucket> aggregated = new HashMap<>();
        for (Trade trade : trades) {
            aggregated.computeIfAbsent(activityKey(trade), ignored -> new AggregateBucket()).accept(trade);
        }

        return aggregated.entrySet().stream()
                .sorted(Comparator
                        .comparing((Map.Entry<ActivityKey, AggregateBucket> entry) -> entry.getKey().tradeDate())
                        .thenComparingInt(entry -> entry.getKey().hour()))
                .map(entry -> new TradingActivityAggregateRow(
                        entry.getKey().tradeDate(),
                        entry.getKey().hour(),
                        entry.getValue().tradeCount(),
                        entry.getValue().uniqueClients().size(),
                        entry.getValue().totalQuantity(),
                        entry.getValue().totalNotional()))
                .toList();
    }

    /** Net buyers first (largest net quantity bought), net sellers last; ties by symbol. */
    private List<BuySellBalanceRow> aggregateBuySellBalance(List<Trade> trades) {
        Map<InstrumentKey, BalanceBucket> aggregated = new HashMap<>();
        for (Trade trade : trades) {
            aggregated.computeIfAbsent(instrumentKey(trade), ignored -> new BalanceBucket()).accept(trade);
        }

        return aggregated.entrySet().stream()
                .map(entry -> new BuySellBalanceRow(entry.getKey(), entry.getValue().buys, entry.getValue().sells))
                .sorted(Comparator
                        .comparingLong(BuySellBalanceRow::netQuantity)
                        .reversed()
                        .thenComparing(row -> row.instrument().instrumentSymbol()))
                .toList();
    }

    private List<String> buySellBalanceReportRow(BuySellBalanceRow row) {
        return List.of(
                row.instrument().instrumentSymbol(),
                row.instrument().instrumentName(),
                row.instrument().assetClass(),
                row.instrument().marketCode(),
                Long.toString(row.buys().tradeCount()),
                Long.toString(row.sells().tradeCount()),
                Long.toString(row.buys().totalQuantity()),
                Long.toString(row.sells().totalQuantity()),
                Long.toString(row.netQuantity()),
                formatMoney(row.buys().totalNotional()),
                formatMoney(row.sells().totalNotional()),
                formatMoney(row.netNotional()));
    }

    private List<String> instrumentReportRow(InstrumentAggregateRow row) {
        return List.of(
                row.instrumentSymbol(),
                row.instrumentName(),
                row.assetClass(),
                row.marketCode(),
                Long.toString(row.tradeCount()),
                Long.toString(row.totalQuantity()),
                formatMoney(row.totalNotional()),
                formatMoney(row.averageExecutionPrice()));
    }

    private List<String> clientSegmentReportRow(ClientSegmentAggregateRow row) {
        return List.of(
                row.clientSegment(),
                Long.toString(row.tradeCount()),
                Long.toString(row.uniqueClients()),
                Long.toString(row.totalQuantity()),
                formatMoney(row.totalNotional()));
    }

    private List<String> tradingActivityReportRow(TradingActivityAggregateRow row) {
        return List.of(
                DATE_FORMATTER.format(row.tradeDate()),
                String.format(Locale.ROOT, "%02d:00", row.hour()),
                Long.toString(row.tradeCount()),
                Long.toString(row.uniqueClients()),
                Long.toString(row.totalQuantity()),
                formatMoney(row.totalNotional()));
    }

    private String formatMoney(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private String toCsv(List<String> headers, List<List<String>> rows) {
        StringBuilder csv = new StringBuilder();
        csv.append(toCsvLine(headers));
        for (List<String> row : rows) {
            csv.append('\n').append(toCsvLine(row));
        }
        csv.append('\n');
        return csv.toString();
    }

    private String toCsvLine(List<String> values) {
        return values.stream()
                .map(this::escapeCsvValue)
                .collect(Collectors.joining(","));
    }

    private String escapeCsvValue(String value) {
        String safeValue = Objects.toString(value, "");
        return requiresCsvQuoting(safeValue)
                ? '"' + safeValue.replace("\"", "\"\"") + '"'
                : safeValue;
    }

    private boolean requiresCsvQuoting(String value) {
        return value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r");
    }

    private static InstrumentKey instrumentKey(Trade trade) {
        return new InstrumentKey(trade.instrumentSymbol(), trade.instrumentName(), trade.assetClass(), trade.marketCode());
    }

    private static ActivityKey activityKey(Trade trade) {
        ZonedDateTime centralTime = trade.filledAt().atZone(MarketDay.ZONE);
        return new ActivityKey(centralTime.toLocalDate(), centralTime.getHour());
    }

    private record InstrumentKey(String instrumentSymbol, String instrumentName, String assetClass, String marketCode) {
    }

    private record ActivityKey(LocalDate tradeDate, int hour) {
    }

    private record InstrumentAggregateRow(
            String instrumentSymbol,
            String instrumentName,
            String assetClass,
            String marketCode,
            long tradeCount,
            long totalQuantity,
            BigDecimal totalNotional) {

        private BigDecimal averageExecutionPrice() {
            if (totalQuantity == 0L) {
                return ZERO_MONEY;
            }
            return totalNotional.divide(BigDecimal.valueOf(totalQuantity), 2, RoundingMode.HALF_UP);
        }
    }

    private record ClientSegmentAggregateRow(
            String clientSegment,
            long tradeCount,
            long uniqueClients,
            long totalQuantity,
            BigDecimal totalNotional) {
    }

    private record TradingActivityAggregateRow(
            LocalDate tradeDate,
            int hour,
            long tradeCount,
            long uniqueClients,
            long totalQuantity,
            BigDecimal totalNotional) {
    }

    /**
     * Bought and sold totals for one instrument. Net values are bought minus sold, so a positive
     * net quantity means clients accumulated the instrument over the period.
     */
    private record BuySellBalanceRow(InstrumentKey instrument, AggregateBucket buys, AggregateBucket sells) {

        private long netQuantity() {
            return buys.totalQuantity() - sells.totalQuantity();
        }

        private BigDecimal netNotional() {
            return buys.totalNotional().subtract(sells.totalNotional());
        }
    }

    private static final class BalanceBucket {

        private final AggregateBucket buys = new AggregateBucket();
        private final AggregateBucket sells = new AggregateBucket();

        private void accept(Trade trade) {
            if (BUY_SIDE.equals(trade.side())) {
                buys.accept(trade);
            } else if (SELL_SIDE.equals(trade.side())) {
                sells.accept(trade);
            } else {
                throw new IllegalStateException("Unexpected side in " + REPORTING_DATASET_ROW.toLowerCase(Locale.ROOT) + ": " + trade.side());
            }
        }
    }

    private static final class AggregateBucket {

        private long tradeCount;
        private long totalQuantity;
        private BigDecimal totalNotional = ZERO_MONEY;
        private final Set<String> uniqueClients = new HashSet<>();

        private void accept(Trade trade) {
            tradeCount++;
            totalQuantity += trade.filledQuantity();
            totalNotional = totalNotional.add(trade.notional());
            uniqueClients.add(trade.accountNumber());
        }

        private long tradeCount() {
            return tradeCount;
        }

        private long totalQuantity() {
            return totalQuantity;
        }

        private BigDecimal totalNotional() {
            return totalNotional;
        }

        private Set<String> uniqueClients() {
            return uniqueClients;
        }
    }
}
