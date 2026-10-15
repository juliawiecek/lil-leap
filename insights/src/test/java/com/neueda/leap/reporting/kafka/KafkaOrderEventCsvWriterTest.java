package com.neueda.leap.reporting.kafka;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class KafkaOrderEventCsvWriterTest {

    @TempDir
    Path tempDir;

    @Test
    void writesCompletedFailedAndAuditCsvFiles() throws Exception {
        KafkaOrderEventCsvWriter writer = new KafkaOrderEventCsvWriter(tempDir.toString());
        OrderLifecycleEvent completed = event("FILLED", null, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                "AAPL,INC", "BUY", 10L, Instant.parse("2026-10-13T12:00:00Z"),
                Instant.parse("2026-10-13T12:01:00Z"), Instant.parse("2026-10-13T12:01:30Z"), 10L,
                new BigDecimal("101.2500"));
        OrderLifecycleEvent failed = event("REJECTED", "INSUFFICIENT_CASH", UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                "MSFT", "SELL", 5L, Instant.parse("2026-10-13T13:00:00Z"),
                Instant.parse("2026-10-13T13:00:05Z"), null, null, null);

        writer.writeCompleted(completed);
        writer.writeFailed(failed);
        writer.writeAudit(completed);
        writer.writeAudit(failed);

        List<String> completedLines = Files.readAllLines(tempDir.resolve("completed-trades.csv"));
        List<String> failedLines = Files.readAllLines(tempDir.resolve("failed-trades.csv"));
        List<String> auditLines = Files.readAllLines(tempDir.resolve("trade-audit.csv"));

        assertThat(completedLines.get(0)).startsWith("status,order_id,symbol,side,quantity");
        assertThat(completedLines.get(1)).contains("FILLED").contains("\"AAPL,INC\"").contains("101.2500");
        assertThat(failedLines.get(0)).startsWith("status,order_id,symbol,side,quantity");
        assertThat(failedLines.get(1)).contains("REJECTED").contains("INSUFFICIENT_CASH");
        assertThat(auditLines).hasSize(3);
        assertThat(auditLines.get(1)).contains("FILLED");
        assertThat(auditLines.get(2)).contains("REJECTED");
    }

    private static OrderLifecycleEvent event(String status, String reasonCode,
                                             UUID orderId, UUID accountId, UUID instrumentId,
                                             String symbol, String side, long quantity,
                                             Instant submittedAt, Instant completedAt, Instant filledAt,
                                             Long filledQuantity, BigDecimal executionPrice) {
        return new OrderLifecycleEvent(orderId, accountId, instrumentId, symbol, side, quantity, "MARKET",
                status, reasonCode, submittedAt, completedAt, filledAt, filledQuantity, executionPrice);
    }
}

