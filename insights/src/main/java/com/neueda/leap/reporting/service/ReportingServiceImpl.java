package com.neueda.leap.reporting.service;

import com.neueda.leap.reporting.dto.ClientActivityTrendDto;
import com.neueda.leap.reporting.dto.OverviewDto;
import com.neueda.leap.reporting.dto.TopInstrumentDto;
import com.neueda.leap.reporting.entity.TradeFillEntity;
import com.neueda.leap.reporting.model.ReportDateRange;
import com.neueda.leap.reporting.repository.TradeReportingRepository;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
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

    private static final String REPORTS_RESOURCE_PATH = "classpath:reports/trades.csv";
    private static final String INSTRUMENT_REPORT_FILENAME = "instrument-report.csv";
    private static final String CLIENT_SEGMENT_REPORT_FILENAME = "client-segment-report.csv";
    private static final String TRADING_ACTIVITY_REPORT_FILENAME = "trading-activity-report.csv";
    private static final String REPORTING_DATASET = "Reporting dataset";
    private static final String REPORTING_DATASET_ROW = REPORTING_DATASET + " row";
    private static final String HEADER_TRADE_COUNT = "trade_count";
    private static final String HEADER_TOTAL_QUANTITY = "total_quantity";
    private static final String HEADER_TOTAL_NOTIONAL = "total_notional";

    private static final List<String> INPUT_HEADERS = List.of(
            "fill_id",
            "order_id",
            "filled_at",
            "instrument_id",
            "instrument_symbol",
            "instrument_name",
            "asset_class",
            "market_code",
            "user_id",
            "client_email",
            "account_id",
            "account_number",
            "account_status",
            "trader_level",
            "side",
            "filled_quantity",
            "execution_price");

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

    private static final DateTimeFormatter HOUR_FORMATTER = DateTimeFormatter.ofPattern("HH:mm", Locale.ROOT);
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final BigDecimal ZERO_MONEY = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    private static final MediaType TEXT_CSV_UTF8 = new MediaType("text", "csv", StandardCharsets.UTF_8);

    private final TradeReportingRepository repository;
    private final Clock clock;
    private final ResourceLoader resourceLoader;

    /**
     * Creates the reporting service.
     *
     * @param repository existing read-only reporting repository used by the dashboard insights endpoints
     * @param clock UTC-aware clock used to derive the current day window
     * @param resourceLoader classpath resource loader used to read the BR-16 CSV dataset
     */
    public ReportingServiceImpl(TradeReportingRepository repository, Clock clock, ResourceLoader resourceLoader) {
        this.repository = repository;
        this.clock = clock;
        this.resourceLoader = resourceLoader;
    }

    @Override
    public OverviewDto getOverview() {
        ReportDateRange range = currentUtcDayRange();
        TradeReportingRepository.OverviewProjection overview =
                repository.summarize(range.startInclusive(), range.endExclusive());

        return new OverviewDto(
                defaultLong(overview == null ? null : overview.getTradeVolumeToday()),
                defaultLong(overview == null ? null : overview.getActiveClientsToday()),
                scaleMoney(overview == null ? null : overview.getTradeValueToday()));
    }

    @Override
    public List<TopInstrumentDto> getTopInstruments() {
        ReportDateRange range = currentUtcDayRange();
        return repository.findTopInstrumentsByTradeCount(
                        range.startInclusive(),
                        range.endExclusive(),
                        PageRequest.of(0, TOP_INSTRUMENTS_LIMIT))
                .stream()
                .map(item -> new TopInstrumentDto(item.getInstrument(), defaultLong(item.getTradeCount())))
                .toList();
    }

    @Override
    public List<ClientActivityTrendDto> getClientActivityTrend() {
        ReportDateRange range = currentUtcDayRange();
        Map<String, Long> countsByHour = repository
                .findByFilledAtGreaterThanEqualAndFilledAtLessThanOrderByFilledAtAsc(
                        range.startInclusive(),
                        range.endExclusive())
                .stream()
                .map(TradeFillEntity::getFilledAt)
                .map(this::toUtcHourLabel)
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
    public ResponseEntity<Resource> generateInstrumentReport() {
        List<TradeRow> trades = loadTrades();
        List<List<String>> rows = aggregateByInstrument(trades).stream()
                .map(this::instrumentReportRow)
                .toList();
        return buildCsvAttachment(INSTRUMENT_REPORT_FILENAME, INSTRUMENT_REPORT_HEADERS, rows);
    }

    @Override
    public ResponseEntity<Resource> generateClientSegmentReport() {
        List<TradeRow> trades = loadTrades();
        List<List<String>> rows = aggregateByClientSegment(trades).stream()
                .map(this::clientSegmentReportRow)
                .toList();
        return buildCsvAttachment(CLIENT_SEGMENT_REPORT_FILENAME, CLIENT_SEGMENT_REPORT_HEADERS, rows);
    }

    @Override
    public ResponseEntity<Resource> generateTradingActivityReport() {
        List<TradeRow> trades = loadTrades();
        List<List<String>> rows = aggregateByTradingActivity(trades).stream()
                .map(this::tradingActivityReportRow)
                .toList();
        return buildCsvAttachment(TRADING_ACTIVITY_REPORT_FILENAME, TRADING_ACTIVITY_REPORT_HEADERS, rows);
    }

    private ReportDateRange currentUtcDayRange() {
        LocalDate todayUtc = LocalDate.now(clock);
        return new ReportDateRange(todayUtc, todayUtc);
    }

    private String toUtcHourLabel(Instant executionTime) {
        return executionTime.atOffset(ZoneOffset.UTC)
                .withMinute(0)
                .withSecond(0)
                .withNano(0)
                .toLocalTime()
                .format(HOUR_FORMATTER);
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

    private List<TradeRow> loadTrades() {
        Resource resource = resourceLoader.getResource(REPORTS_RESOURCE_PATH);
        if (!resource.exists()) {
            throw new IllegalStateException(REPORTING_DATASET + " not found: " + REPORTS_RESOURCE_PATH);
        }

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            String headerLine = reader.readLine();
            if (headerLine == null) {
                throw new IllegalStateException(REPORTING_DATASET + " is empty: " + REPORTS_RESOURCE_PATH);
            }

            List<String> actualHeaders = parseCsvLine(headerLine);
            if (!INPUT_HEADERS.equals(actualHeaders)) {
                throw new IllegalStateException("Unexpected " + REPORTING_DATASET.toLowerCase(Locale.ROOT) + " header: " + actualHeaders);
            }

            List<TradeRow> trades = new ArrayList<>();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }

                List<String> columns = parseCsvLine(line);
                if (columns.size() != INPUT_HEADERS.size()) {
                    throw new IllegalStateException("Unexpected column count in " + REPORTING_DATASET_ROW.toLowerCase(Locale.ROOT) + ": " + columns);
                }

                trades.add(mapTradeRow(columns));
            }

            return trades;
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read " + REPORTING_DATASET.toLowerCase(Locale.ROOT) + " from " + REPORTS_RESOURCE_PATH, ex);
        }
    }

    private TradeRow mapTradeRow(List<String> columns) {
        return new TradeRow(
                columns.get(0),
                columns.get(1),
                Instant.parse(columns.get(2)),
                columns.get(3),
                columns.get(4),
                columns.get(5),
                columns.get(6),
                columns.get(7),
                columns.get(8),
                columns.get(9),
                columns.get(10),
                columns.get(11),
                columns.get(12),
                columns.get(13),
                columns.get(14),
                Long.parseLong(columns.get(15)),
                new BigDecimal(columns.get(16)));
    }

    private List<InstrumentAggregateRow> aggregateByInstrument(List<TradeRow> trades) {
        Map<InstrumentKey, AggregateBucket> aggregated = new HashMap<>();
        for (TradeRow trade : trades) {
            aggregated.computeIfAbsent(trade.instrumentKey(), ignored -> new AggregateBucket()).accept(trade);
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

    private List<ClientSegmentAggregateRow> aggregateByClientSegment(List<TradeRow> trades) {
        Map<String, AggregateBucket> aggregated = new HashMap<>();
        for (TradeRow trade : trades) {
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

    private List<TradingActivityAggregateRow> aggregateByTradingActivity(List<TradeRow> trades) {
        Map<ActivityKey, AggregateBucket> aggregated = new HashMap<>();
        for (TradeRow trade : trades) {
            aggregated.computeIfAbsent(trade.activityKey(), ignored -> new AggregateBucket()).accept(trade);
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
        boolean requiresQuoting = safeValue.contains(",") || safeValue.contains("\"") || safeValue.contains("\n") || safeValue.contains("\r");
        if (!requiresQuoting) {
            return safeValue;
        }
        return '"' + safeValue.replace("\"", "\"\"") + '"';
    }

    private List<String> parseCsvLine(String line) {
        List<String> values = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean[] inQuotes = {false};

        int index = 0;
        while (index < line.length()) {
            index = consumeCsvCharacter(line, index, values, current, inQuotes);
        }

        values.add(current.toString());
        return values;
    }

    private boolean isEscapedQuote(String line, int index) {
        return line.charAt(index) == '"' && index + 1 < line.length() && line.charAt(index + 1) == '"';
    }

    private int consumeCsvCharacter(String line, int index, List<String> values, StringBuilder current, boolean[] inQuotes) {
        char character = line.charAt(index);
        if (inQuotes[0]) {
            if (isEscapedQuote(line, index)) {
                current.append('"');
                return index + 2;
            }
            if (character == '"') {
                inQuotes[0] = false;
            } else {
                current.append(character);
            }
            return index + 1;
        }

        if (character == ',') {
            values.add(current.toString());
            current.setLength(0);
            return index + 1;
        }
        if (character == '"') {
            inQuotes[0] = true;
            return index + 1;
        }
        current.append(character);
        return index + 1;
    }

    private record TradeRow(
            String fillId,
            String orderId,
            Instant filledAt,
            String instrumentId,
            String instrumentSymbol,
            String instrumentName,
            String assetClass,
            String marketCode,
            String userId,
            String clientEmail,
            String accountId,
            String accountNumber,
            String accountStatus,
            String traderLevel,
            String side,
            long filledQuantity,
            BigDecimal executionPrice) {

        private InstrumentKey instrumentKey() {
            return new InstrumentKey(instrumentSymbol, instrumentName, assetClass, marketCode);
        }

        private ActivityKey activityKey() {
            LocalDate tradeDate = filledAt.atOffset(ZoneOffset.UTC).toLocalDate();
            int hour = filledAt.atOffset(ZoneOffset.UTC).getHour();
            return new ActivityKey(tradeDate, hour);
        }

        private BigDecimal notional() {
            return executionPrice.multiply(BigDecimal.valueOf(filledQuantity));
        }
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

    private static final class AggregateBucket {

        private long tradeCount;
        private long totalQuantity;
        private BigDecimal totalNotional = ZERO_MONEY;
        private final Set<String> uniqueClients = new HashSet<>();

        private void accept(TradeRow trade) {
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
