package com.neueda.leap.order.execution.event;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.concurrent.CompletableFuture;
import java.util.UUID;

/**
 * Kafka-backed publisher for terminal order lifecycle events.
 */
@Service
public class KafkaOrderLifecycleEventPublisher implements OrderLifecycleEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(KafkaOrderLifecycleEventPublisher.class);

    private final JdbcTemplate jdbcTemplate;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final String topic;

    /**
     * Creates the publisher.
     *
     * @param jdbcTemplate transactional database access used to read the committed terminal order state
     * @param kafkaTemplate Kafka client used to publish the JSON payload
     * @param objectMapper shared JSON mapper
     * @param topic Kafka topic used for order lifecycle events
     */
    public KafkaOrderLifecycleEventPublisher(JdbcTemplate jdbcTemplate,
                                            KafkaTemplate<String, String> kafkaTemplate,
                                            ObjectMapper objectMapper,
                                            @Value("${orders.kafka.topic:order-events}") String topic) {
        this.jdbcTemplate = jdbcTemplate;
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.topic = topic;
    }

    @Override
    public void publishTerminalEvent(UUID orderId) {
        OrderLifecycleEvent event = loadEvent(orderId);
        if (!isTerminal(event.status())) {
            log.debug("Skipping non-terminal order event {} with status {}", orderId, event.status());
            return;
        }

        try {
            CompletableFuture<?> send = kafkaTemplate.send(topic, orderId.toString(), objectMapper.writeValueAsString(event));
            send.whenComplete((result, ex) -> {
                if (ex != null) {
                    log.warn("Unable to publish terminal order {} to Kafka topic {}", orderId, topic, ex);
                }
            });
        } catch (JsonProcessingException ex) {
            log.warn("Unable to serialise terminal order {} for Kafka topic {}", orderId, topic, ex);
        }
    }

    private OrderLifecycleEvent loadEvent(UUID orderId) {
        OrderProjection projection = jdbcTemplate.queryForObject("""
                SELECT o.order_id,
                       o.account_id,
                       o.instrument_id,
                       i.symbol,
                       o.side,
                       o.quantity,
                       o.order_type,
                       o.status,
                       o.last_execution_error,
                       o.submitted_at,
                       o.updated_at,
                       f.filled_at,
                       f.filled_quantity,
                       f.execution_price
                FROM orders o
                JOIN instruments i ON i.instrument_id = o.instrument_id
                LEFT JOIN fills f ON f.order_id = o.order_id
                WHERE o.order_id = ?
                """, (rs, rowNum) -> new OrderProjection(
                rs.getObject("order_id", UUID.class),
                rs.getObject("account_id", UUID.class),
                rs.getObject("instrument_id", UUID.class),
                rs.getString("symbol"),
                rs.getString("side"),
                rs.getLong("quantity"),
                rs.getString("order_type"),
                rs.getString("status"),
                rs.getString("last_execution_error"),
                toInstant(rs.getTimestamp("submitted_at")),
                toInstant(rs.getTimestamp("updated_at")),
                toInstant(rs.getTimestamp("filled_at")),
                rs.getObject("filled_quantity", Long.class),
                rs.getBigDecimal("execution_price")),
                orderId);

        if (projection == null) {
            throw new IllegalStateException("Terminal order is unavailable: " + orderId);
        }

        return new OrderLifecycleEvent(
                projection.orderId(),
                projection.accountId(),
                projection.instrumentId(),
                projection.symbol(),
                projection.side(),
                projection.quantity(),
                projection.orderType(),
                projection.status(),
                projection.reasonCode(),
                projection.submittedAt(),
                projection.completedAt(),
                projection.filledAt(),
                projection.filledQuantity(),
                projection.executionPrice());
    }

    private boolean isTerminal(String status) {
        return "FILLED".equals(status) || "REJECTED".equals(status);
    }

    private static Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private record OrderProjection(
            UUID orderId,
            UUID accountId,
            UUID instrumentId,
            String symbol,
            String side,
            long quantity,
            String orderType,
            String status,
            String reasonCode,
            Instant submittedAt,
            Instant completedAt,
            Instant filledAt,
            Long filledQuantity,
            BigDecimal executionPrice) {
    }
}


