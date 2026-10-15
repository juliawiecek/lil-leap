package com.neueda.leap.reporting.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class KafkaOrderEventConsumerServiceTest {

    @Mock
    private ObjectMapper objectMapper;

    @Mock
    private KafkaOrderEventCsvWriter writer;

    @Test
    void completedConsumerFiltersFilledEvents() throws Exception {
        OrderLifecycleEvent filled = event("FILLED", null);
        when(objectMapper.readValue(anyString(), eq(OrderLifecycleEvent.class))).thenReturn(filled);
        KafkaOrderEventConsumerService service = new KafkaOrderEventConsumerService(objectMapper, writer);

        service.consumeCompleted("filled-payload");

        verify(writer).writeCompleted(filled);
        verify(writer, never()).writeFailed(filled);
        verify(writer, never()).writeAudit(filled);
    }

    @Test
    void failedConsumerFiltersRejectedEvents() throws Exception {
        OrderLifecycleEvent rejected = event("REJECTED", "INSUFFICIENT_CASH");
        when(objectMapper.readValue(anyString(), eq(OrderLifecycleEvent.class))).thenReturn(rejected);
        KafkaOrderEventConsumerService service = new KafkaOrderEventConsumerService(objectMapper, writer);

        service.consumeFailed("rejected-payload");

        verify(writer).writeFailed(rejected);
        verify(writer, never()).writeCompleted(rejected);
        verify(writer, never()).writeAudit(rejected);
    }

    @Test
    void auditConsumerWritesEveryTerminalEvent() throws Exception {
        OrderLifecycleEvent rejected = event("REJECTED", "INSUFFICIENT_HOLDINGS");
        when(objectMapper.readValue(anyString(), eq(OrderLifecycleEvent.class))).thenReturn(rejected);
        KafkaOrderEventConsumerService service = new KafkaOrderEventConsumerService(objectMapper, writer);

        service.consumeAudit("audit-payload");

        verify(writer).writeAudit(rejected);
    }

    @Test
    void consumersIgnoreNonMatchingStatusesLocally() throws Exception {
        OrderLifecycleEvent accepted = event("ACCEPTED", null);
        when(objectMapper.readValue(anyString(), eq(OrderLifecycleEvent.class))).thenReturn(accepted);
        KafkaOrderEventConsumerService service = new KafkaOrderEventConsumerService(objectMapper, writer);

        service.consumeCompleted("accepted-payload");
        service.consumeFailed("accepted-payload");
        service.consumeAudit("accepted-payload");

        verify(writer, never()).writeCompleted(accepted);
        verify(writer, never()).writeFailed(accepted);
        verify(writer).writeAudit(accepted);
    }

    private static OrderLifecycleEvent event(String status, String reasonCode) {
        return new OrderLifecycleEvent(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "AAPL",
                "BUY",
                10L,
                "MARKET",
                status,
                reasonCode,
                Instant.parse("2026-10-13T12:00:00Z"),
                Instant.parse("2026-10-13T12:01:00Z"),
                Instant.parse("2026-10-13T12:01:30Z"),
                10L,
                new BigDecimal("101.25"));
    }
}
