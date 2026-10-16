package com.neueda.leap.reporting.kafka;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Objects;

/** Writes terminal order events into CSV files under a configurable output directory. */
@Service
public class KafkaOrderEventCsvWriter {

    private static final List<String> COMPLETED_HEADERS = List.of(
            "status", "order_id", "symbol", "side", "quantity", "filled_quantity", "execution_price",
            "submitted_at", "completed_at", "reason_code");

    private static final List<String> FAILED_HEADERS = List.of(
            "status", "order_id", "symbol", "side", "quantity", "submitted_at", "completed_at", "reason_code");

    private static final List<String> AUDIT_HEADERS = List.of(
            "status", "order_id", "account_id", "instrument_id", "symbol", "side", "quantity", "order_type",
            "submitted_at", "completed_at", "filled_at", "filled_quantity", "execution_price", "reason_code");

    private final Path outputDir;
    private final Path completedFile;
    private final Path failedFile;
    private final Path auditFile;

    /**
     * Creates the writer.
     *
     * @param outputDir directory where the CSV files are written
     */
    public KafkaOrderEventCsvWriter(@Value("${insights.kafka.output-dir:${java.io.tmpdir}/insights-kafka}") String outputDir) {
        this.outputDir = Paths.get(outputDir);
        this.completedFile = this.outputDir.resolve("completed-trades.csv");
        this.failedFile = this.outputDir.resolve("failed-trades.csv");
        this.auditFile = this.outputDir.resolve("trade-audit.csv");
    }

    /** Ensures the output directory exists before the Kafka listeners start writing to it. */
    @PostConstruct
    void ensureOutputDirectory() throws IOException {
        Files.createDirectories(outputDir);
    }

    /**
     * Writes a completed trade row when the event reached FILLED.
     *
     * @param event the filled order event
     */
    public synchronized void writeCompleted(OrderLifecycleEvent event) {
        appendCsv(completedFile, COMPLETED_HEADERS, completedRow(event));
    }

    /**
     * Writes a failed trade row when the event reached REJECTED.
     *
     * @param event the rejected order event
     */
    public synchronized void writeFailed(OrderLifecycleEvent event) {
        appendCsv(failedFile, FAILED_HEADERS, failedRow(event));
    }

    /**
     * Writes every terminal order event to the audit file.
     *
     * @param event the terminal order event
     */
    public synchronized void writeAudit(OrderLifecycleEvent event) {
        appendCsv(auditFile, AUDIT_HEADERS, auditRow(event));
    }

    private void appendCsv(Path file, List<String> headers, List<String> row) {
        try {
            ensureOutputDirectory();
            if (Files.notExists(file) || Files.size(file) == 0L) {
                Files.writeString(file, csvLine(headers) + System.lineSeparator(), StandardCharsets.UTF_8);
            }
            Files.writeString(file, csvLine(row) + System.lineSeparator(), StandardCharsets.UTF_8,
                    java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
        } catch (IOException ex) {
            throw new IllegalStateException("Unable to write Kafka CSV output to " + file, ex);
        }
    }

    private List<String> completedRow(OrderLifecycleEvent event) {
        return List.of(
                event.status(),
                stringValue(event.orderId()),
                event.symbol(),
                event.side(),
                longValue(event.quantity()),
                stringValue(event.filledQuantity()),
                moneyValue(event.executionPrice()),
                instantValue(event.submittedAt()),
                instantValue(event.completedAt()),
                stringValue(event.reasonCode())
        );
    }

    private List<String> failedRow(OrderLifecycleEvent event) {
        return List.of(
                event.status(),
                stringValue(event.orderId()),
                event.symbol(),
                event.side(),
                longValue(event.quantity()),
                instantValue(event.submittedAt()),
                instantValue(event.completedAt()),
                stringValue(event.reasonCode())
        );
    }

    private List<String> auditRow(OrderLifecycleEvent event) {
        return List.of(
                event.status(),
                stringValue(event.orderId()),
                stringValue(event.accountId()),
                stringValue(event.instrumentId()),
                event.symbol(),
                event.side(),
                longValue(event.quantity()),
                event.orderType(),
                instantValue(event.submittedAt()),
                instantValue(event.completedAt()),
                instantValue(event.filledAt()),
                stringValue(event.filledQuantity()),
                moneyValue(event.executionPrice()),
                stringValue(event.reasonCode())
        );
    }

    private String csvLine(List<String> values) {
        return values.stream().map(this::escapeCsvValue).reduce((left, right) -> left + "," + right).orElse("");
    }

    private String escapeCsvValue(String value) {
        String safeValue = Objects.toString(value, "");
        return requiresCsvQuoting(safeValue) ? '"' + safeValue.replace("\"", "\"\"") + '"' : safeValue;
    }

    private boolean requiresCsvQuoting(String value) {
        return value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r");
    }

    private String instantValue(java.time.Instant value) {
        return value == null ? "" : value.toString();
    }

    private String moneyValue(BigDecimal value) {
        return value == null ? "" : value.toPlainString();
    }

    private String longValue(long value) {
        return Long.toString(value);
    }

    private String stringValue(Object value) {
        return value == null ? "" : value.toString();
    }
}

