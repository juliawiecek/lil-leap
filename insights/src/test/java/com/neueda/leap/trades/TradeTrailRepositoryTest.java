package com.neueda.leap.trades;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@ActiveProfiles("test")
@Import(TradeTrailRepository.class)
class TradeTrailRepositoryTest {

    @Autowired TradeTrailRepository repository;
    @Autowired JdbcTemplate jdbc;

    private final Instant t0 = Instant.parse("2026-10-14T14:30:00Z");

    @BeforeEach
    void schema() {
        // Only the columns the trail reads; the view is a plain table here.
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS orders (order_id UUID PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS order_status_history (order_id UUID, status VARCHAR(20),
                    reason_code VARCHAR(50), reason_text VARCHAR(200), occurred_at TIMESTAMP WITH TIME ZONE);
                CREATE TABLE IF NOT EXISTS v_trade_audit_events (order_id UUID, actor_type VARCHAR(20),
                    event_type VARCHAR(100), payload VARCHAR(500), created_at TIMESTAMP WITH TIME ZONE);
                CREATE TABLE IF NOT EXISTS fills (fill_id UUID PRIMARY KEY, order_id UUID, filled_quantity BIGINT,
                    execution_price NUMERIC(18,8), quote_timestamp TIMESTAMP WITH TIME ZONE, filled_at TIMESTAMP WITH TIME ZONE);
                CREATE TABLE IF NOT EXISTS cash_transactions (fill_id UUID, transaction_type VARCHAR(20), amount NUMERIC(18,2),
                    currency CHAR(3), settlement_status VARCHAR(20), settled_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE);
                CREATE TABLE IF NOT EXISTS holding_movements (fill_id UUID, movement_type VARCHAR(20), quantity_change BIGINT,
                    cost_basis NUMERIC(18,8), created_at TIMESTAMP WITH TIME ZONE);
                """);
    }

    @Test
    void anUnknownOrderHasNoTrail() {
        assertThat(repository.trail(UUID.randomUUID())).isEmpty();
    }

    @Test
    void theTrailJoinsEveryRecordOfTheOrderInTimeOrder() {
        UUID order = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        UUID fill = UUID.randomUUID();
        jdbc.update("INSERT INTO orders VALUES (?), (?)", order, other);
        // Inserted out of order: the trail sorts by time, then status before audit before ledgers.
        jdbc.update("INSERT INTO holding_movements VALUES (?, 'BUY', 2, 225.10000000, ?)", fill, at(3));
        jdbc.update("INSERT INTO cash_transactions VALUES (?, 'BUY', -450.20, 'USD', 'SETTLED', ?, ?)", fill, at(3), at(3));
        jdbc.update("INSERT INTO fills VALUES (?, ?, 2, 225.10000000, ?, ?)", fill, order, at(2), at(3));
        jdbc.update("INSERT INTO v_trade_audit_events VALUES (?, 'SYSTEM', 'ORDER_FILLED', '{\"price\":225.1}', ?)", order, at(3));
        jdbc.update("INSERT INTO order_status_history VALUES (?, 'FILLED', NULL, NULL, ?)", order, at(3));
        jdbc.update("INSERT INTO v_trade_audit_events VALUES (?, 'USER', 'ORDER_SUBMITTED', '{}', ?)", order, at(0));
        jdbc.update("INSERT INTO order_status_history VALUES (?, 'SUBMITTED', NULL, NULL, ?)", order, at(0));
        jdbc.update("INSERT INTO order_status_history VALUES (?, 'SUBMITTED', NULL, NULL, ?)", other, at(1));

        List<TradeEvent> trail = repository.trail(order).orElseThrow();

        assertThat(trail).extracting(TradeEvent::source, TradeEvent::type).containsExactly(
                org.assertj.core.groups.Tuple.tuple("STATUS", "SUBMITTED"),
                org.assertj.core.groups.Tuple.tuple("AUDIT", "ORDER_SUBMITTED"),
                org.assertj.core.groups.Tuple.tuple("STATUS", "FILLED"),
                org.assertj.core.groups.Tuple.tuple("AUDIT", "ORDER_FILLED"),
                org.assertj.core.groups.Tuple.tuple("FILL", "FILLED"),
                org.assertj.core.groups.Tuple.tuple("CASH", "BUY"),
                org.assertj.core.groups.Tuple.tuple("HOLDING", "BUY"));
        assertThat(trail.get(1).actor()).isEqualTo("USER");
        assertThat(trail.get(3).details()).containsEntry("payload", "{\"price\":225.1}");
        assertThat(trail.get(4).details()).containsEntry("quantity", 2L).containsEntry("price", "225.1")
                .containsEntry("quoteTimestamp", t0.plusSeconds(2));
        assertThat(trail.get(5).details()).containsEntry("amount", "-450.2").containsEntry("settlementStatus", "SETTLED");
        assertThat(trail.get(6).details()).containsEntry("quantityChange", 2L).containsEntry("costBasis", "225.1");
        assertThat(trail.get(0).details()).isEmpty();
    }

    private Timestamp at(int seconds) {
        return Timestamp.from(t0.plusSeconds(seconds));
    }
}
