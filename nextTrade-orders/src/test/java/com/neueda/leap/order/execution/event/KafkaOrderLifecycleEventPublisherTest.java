package com.neueda.leap.order.execution.event;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class KafkaOrderLifecycleEventPublisherTest {
    private static final String TOPIC = "order-events";
    private static final Instant SUBMITTED = Instant.parse("2026-10-01T14:30:00Z");

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    @SuppressWarnings("unchecked")
    private final KafkaTemplate<String, String> kafka = mock(KafkaTemplate.class);
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules()
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private final UUID orderId = UUID.randomUUID();
    private final UUID accountId = UUID.randomUUID();
    private final UUID instrumentId = UUID.randomUUID();
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    private final Logger publisherLog = (Logger) LoggerFactory.getLogger(KafkaOrderLifecycleEventPublisher.class);

    @BeforeEach
    void captureLogs() {
        logs.start();
        publisherLog.addAppender(logs);
    }

    @AfterEach
    void releaseLogs() {
        publisherLog.detachAppender(logs);
    }

    @Test
    void disabledPublisherDoesNotQueryTheDatabaseOrContactKafka() {
        ObjectMapper unusedMapper = mock(ObjectMapper.class);
        var publisher = new KafkaOrderLifecycleEventPublisher(jdbc, kafka, unusedMapper, TOPIC, false);

        publisher.publishTerminalEvent(UUID.randomUUID());

        verifyNoInteractions(jdbc, kafka, unusedMapper);
    }

    @Test
    void filledOrderIsPublishedKeyedByOrderIdWithItsFill() throws Exception {
        ResultSet row = orderRow("FILLED", null);
        when(row.getTimestamp("filled_at")).thenReturn(Timestamp.from(SUBMITTED.plusSeconds(5)));
        when(row.getObject("filled_quantity", Long.class)).thenReturn(10L);
        when(row.getBigDecimal("execution_price")).thenReturn(new BigDecimal("187.25"));
        loads(row);
        when(kafka.send(anyString(), anyString(), anyString())).thenReturn(sent());

        publisher().publishTerminalEvent(orderId);

        JsonNode payload = mapper.readTree(publishedPayload());
        assertThat(payload.get("orderId").asText()).isEqualTo(orderId.toString());
        assertThat(payload.get("accountId").asText()).isEqualTo(accountId.toString());
        assertThat(payload.get("instrumentId").asText()).isEqualTo(instrumentId.toString());
        assertThat(payload.get("symbol").asText()).isEqualTo("AAPL");
        assertThat(payload.get("side").asText()).isEqualTo("BUY");
        assertThat(payload.get("quantity").asLong()).isEqualTo(10L);
        assertThat(payload.get("orderType").asText()).isEqualTo("MARKET");
        assertThat(payload.get("status").asText()).isEqualTo("FILLED");
        assertThat(payload.get("reasonCode").isNull()).isTrue();
        assertThat(Instant.parse(payload.get("submittedAt").asText())).isEqualTo(SUBMITTED);
        assertThat(Instant.parse(payload.get("completedAt").asText())).isEqualTo(SUBMITTED.plusSeconds(5));
        assertThat(Instant.parse(payload.get("filledAt").asText())).isEqualTo(SUBMITTED.plusSeconds(5));
        assertThat(payload.get("filledQuantity").asLong()).isEqualTo(10L);
        assertThat(payload.get("executionPrice").decimalValue()).isEqualByComparingTo("187.25");
        assertThat(logs.list).isEmpty();
    }

    @Test
    void rejectedOrderIsPublishedWithItsReasonAndNoFill() throws Exception {
        loads(orderRow("REJECTED", "INSUFFICIENT_FUNDS"));
        when(kafka.send(anyString(), anyString(), anyString())).thenReturn(sent());

        publisher().publishTerminalEvent(orderId);

        JsonNode payload = mapper.readTree(publishedPayload());
        assertThat(payload.get("status").asText()).isEqualTo("REJECTED");
        assertThat(payload.get("reasonCode").asText()).isEqualTo("INSUFFICIENT_FUNDS");
        assertThat(payload.get("filledAt").isNull()).isTrue();
        assertThat(payload.get("filledQuantity").isNull()).isTrue();
        assertThat(payload.get("executionPrice").isNull()).isTrue();
    }

    @Test
    void orderWithoutTimestampsStillPublishesNullTimes() throws Exception {
        ResultSet row = orderRow("REJECTED", "MARKET_CLOSED");
        when(row.getTimestamp("submitted_at")).thenReturn(null);
        when(row.getTimestamp("updated_at")).thenReturn(null);
        loads(row);
        when(kafka.send(anyString(), anyString(), anyString())).thenReturn(sent());

        publisher().publishTerminalEvent(orderId);

        JsonNode payload = mapper.readTree(publishedPayload());
        assertThat(payload.get("submittedAt").isNull()).isTrue();
        assertThat(payload.get("completedAt").isNull()).isTrue();
    }

    @Test
    void nonTerminalOrderIsNotPublished() throws Exception {
        loads(orderRow("PENDING", null));

        publisher().publishTerminalEvent(orderId);

        verifyNoInteractions(kafka);
    }

    @Test
    void missingOrderIsReportedAsUnavailable() {
        when(jdbc.queryForObject(anyString(), any(RowMapper.class), eq(orderId))).thenReturn(null);

        assertThatThrownBy(() -> publisher().publishTerminalEvent(orderId))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(orderId.toString());
        verifyNoInteractions(kafka);
    }

    @Test
    void serialisationFailureIsLoggedAndNothingIsSent() throws Exception {
        loads(orderRow("FILLED", null));
        ObjectMapper failing = mock(ObjectMapper.class);
        when(failing.writeValueAsString(any())).thenThrow(new JsonProcessingException("boom") { });
        var publisher = new KafkaOrderLifecycleEventPublisher(jdbc, kafka, failing, TOPIC, true);

        assertThatCode(() -> publisher.publishTerminalEvent(orderId)).doesNotThrowAnyException();

        verifyNoInteractions(kafka);
        assertThat(logs.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.WARN);
            assertThat(event.getFormattedMessage()).contains("serialise").contains(orderId.toString()).contains(TOPIC);
        });
    }

    @Test
    void brokerFailureIsLoggedWithoutFailingTheCaller() throws Exception {
        loads(orderRow("FILLED", null));
        when(kafka.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.failedFuture(new IllegalStateException("broker down")));

        assertThatCode(() -> publisher().publishTerminalEvent(orderId)).doesNotThrowAnyException();

        verify(kafka).send(eq(TOPIC), eq(orderId.toString()), anyString());
        assertThat(logs.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.WARN);
            assertThat(event.getFormattedMessage()).contains("publish").contains(orderId.toString()).contains(TOPIC);
        });
    }

    private KafkaOrderLifecycleEventPublisher publisher() {
        return new KafkaOrderLifecycleEventPublisher(jdbc, kafka, mapper, TOPIC, true);
    }

    private String publishedPayload() {
        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(kafka).send(eq(TOPIC), eq(orderId.toString()), payload.capture());
        return payload.getValue();
    }

    private static CompletableFuture<SendResult<String, String>> sent() {
        return CompletableFuture.completedFuture(null);
    }

    @SuppressWarnings("unchecked")
    private void loads(ResultSet row) {
        when(jdbc.queryForObject(contains("WHERE o.order_id = ?"), any(RowMapper.class), eq(orderId)))
                .thenAnswer(invocation -> invocation.<RowMapper<?>>getArgument(1).mapRow(row, 0));
    }

    private ResultSet orderRow(String status, String reason) throws SQLException {
        ResultSet rs = mock(ResultSet.class);
        when(rs.getObject("order_id", UUID.class)).thenReturn(orderId);
        when(rs.getObject("account_id", UUID.class)).thenReturn(accountId);
        when(rs.getObject("instrument_id", UUID.class)).thenReturn(instrumentId);
        when(rs.getString("symbol")).thenReturn("AAPL");
        when(rs.getString("side")).thenReturn("BUY");
        when(rs.getLong("quantity")).thenReturn(10L);
        when(rs.getString("order_type")).thenReturn("MARKET");
        when(rs.getString("status")).thenReturn(status);
        when(rs.getString("last_execution_error")).thenReturn(reason);
        when(rs.getTimestamp("submitted_at")).thenReturn(Timestamp.from(SUBMITTED));
        when(rs.getTimestamp("updated_at")).thenReturn(Timestamp.from(SUBMITTED.plusSeconds(5)));
        return rs;
    }
}
