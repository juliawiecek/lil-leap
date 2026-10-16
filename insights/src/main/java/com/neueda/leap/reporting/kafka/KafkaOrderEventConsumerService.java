package com.neueda.leap.reporting.kafka;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

/**
 * Three independent Kafka consumers for order lifecycle events.
 * Each consumer is in its own group so it sees every event and applies its own local filter.
 */
@Service
public class KafkaOrderEventConsumerService {

    private static final Logger log = LoggerFactory.getLogger(KafkaOrderEventConsumerService.class);

    private final ObjectMapper objectMapper;
    private final KafkaOrderEventCsvWriter writer;

    /**
     * Creates the consumer service.
     *
     * @param objectMapper reads order event JSON payloads
     * @param writer writes accepted events to the CSV files
     */
    public KafkaOrderEventConsumerService(ObjectMapper objectMapper, KafkaOrderEventCsvWriter writer) {
        this.objectMapper = objectMapper;
        this.writer = writer;
    }

    /**
     * Handles completed trades only.
     *
     * @param payload order event JSON from the order events topic
     */
    @KafkaListener(
            topics = "${insights.kafka.topic:order-events}",
            groupId = "${insights.kafka.completed-group:insights-completed-trades}")
    public void consumeCompleted(String payload) {
        consume(payload, "FILLED", writer::writeCompleted, false);
    }

    /**
     * Handles failed trades only.
     *
     * @param payload order event JSON from the order events topic
     */
    @KafkaListener(
            topics = "${insights.kafka.topic:order-events}",
            groupId = "${insights.kafka.failed-group:insights-failed-trades}")
    public void consumeFailed(String payload) {
        consume(payload, "REJECTED", writer::writeFailed, false);
    }

    /**
     * Handles every terminal event for audit purposes.
     *
     * @param payload order event JSON from the order events topic
     */
    @KafkaListener(
            topics = "${insights.kafka.topic:order-events}",
            groupId = "${insights.kafka.audit-group:insights-order-audit}")
    public void consumeAudit(String payload) {
        consume(payload, null, writer::writeAudit, true);
    }

    private void consume(String payload, String requiredStatus,
                         EventSink sink, boolean acceptAllStatuses) {
        try {
            OrderLifecycleEvent event = objectMapper.readValue(payload, OrderLifecycleEvent.class);
            if (!acceptAllStatuses && !requiredStatus.equals(event.status())) {
                return;
            }
            sink.accept(event);
        } catch (JsonProcessingException ex) {
            log.warn("Discarding malformed Kafka order event payload", ex);
        } catch (IllegalStateException ex) {
            log.warn("Unable to persist Kafka order event payload to CSV output", ex);
        }
    }

    @FunctionalInterface
    private interface EventSink {
        void accept(OrderLifecycleEvent event);
    }
}

