package com.neueda.leap.portfolio.repository;

import com.neueda.leap.portfolio.dto.OrderHistoryResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import java.math.BigDecimal;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

/** Preserves NEXT-117 query tests against the actual JDBC read contract. */
class OrderHistoryRepositoryTest {
    private static final Set<String> ALL = Set.of("SUBMITTED", "ACCEPTED", "PENDING", "DELAYED", "FILLED", "REJECTED");
    private static final Instant EARLIEST = Instant.EPOCH;
    private static final Instant LATEST = Instant.parse("9999-12-31T00:00:00Z");
    private EmbeddedDatabase database;
    private JdbcTemplate jdbc;
    private OrderHistoryRepository orderRepository;
    private final UUID userId = UUID.randomUUID();
    private final UUID instrument = UUID.randomUUID();
    private UUID oldFilled, middlePending, newestRejected;

    @BeforeEach
    void setUp() {
        database = new EmbeddedDatabaseBuilder().generateUniqueName(true).setType(EmbeddedDatabaseType.H2).build();
        jdbc = new JdbcTemplate(database);
        jdbc.execute("CREATE TABLE accounts(account_id UUID PRIMARY KEY, user_id UUID NOT NULL)");
        jdbc.execute("CREATE TABLE instruments(instrument_id UUID PRIMARY KEY, symbol VARCHAR(20))");
        jdbc.execute("CREATE TABLE orders(order_id UUID PRIMARY KEY, account_id UUID REFERENCES accounts, instrument_id UUID REFERENCES instruments, side VARCHAR(4), quantity BIGINT, status VARCHAR(20), submitted_at TIMESTAMP WITH TIME ZONE)");
        jdbc.execute("CREATE TABLE fills(order_id UUID UNIQUE REFERENCES orders, execution_price NUMERIC(20,8), filled_quantity BIGINT, filled_at TIMESTAMP WITH TIME ZONE)");
        orderRepository = new OrderHistoryRepository(jdbc);
        UUID account = account(userId);
        jdbc.update("INSERT INTO instruments VALUES (?, 'AAPL')", instrument);
        oldFilled = order(account, "FILLED", "2026-09-01T10:00:00Z");
        middlePending = order(account, "PENDING", "2026-09-15T10:00:00Z");
        newestRejected = order(account, "REJECTED", "2026-09-29T10:00:00Z");
        jdbc.update("INSERT INTO fills VALUES (?, 150.25, 5, ?)", oldFilled, Timestamp.from(Instant.parse("2026-09-01T10:00:01Z")));
        order(account(UUID.randomUUID()), "FILLED", "2026-09-20T10:00:00Z");
    }

    @AfterEach
    void close() { database.shutdown(); }

    private UUID account(UUID owner) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO accounts VALUES (?, ?)", id, owner);
        return id;
    }

    private UUID order(UUID account, String status, String submittedAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO orders VALUES (?, ?, ?, 'BUY', 5, ?, ?)", id, account, instrument, status, Timestamp.from(Instant.parse(submittedAt)));
        return id;
    }

    private List<UUID> ids(List<OrderHistoryResponse> rows) {
        return rows.stream().map(OrderHistoryResponse::orderId).toList();
    }

    @Test
    void noFiltersReturnsOnlyTheCallersOrdersNewestFirst() {
        List<OrderHistoryResponse> rows = orderRepository.findHistory(userId, ALL, EARLIEST, LATEST);

        assertEquals(List.of(newestRejected, middlePending, oldFilled), ids(rows));
    }

    @Test
    void filledOrderIncludesItsFillAndUnfilledOrdersDoNot() {
        List<OrderHistoryResponse> rows = orderRepository.findHistory(userId, ALL, EARLIEST, LATEST);

        OrderHistoryResponse filled = rows.get(2);
        assertEquals("AAPL", filled.symbol());
        assertEquals(0, new BigDecimal("150.25").compareTo(filled.fillPrice()));
        assertEquals(5L, filled.filledQuantity());
        assertNull(rows.get(0).fillPrice());
    }

    @Test
    void statusFilterAloneNarrowsResults() {
        List<OrderHistoryResponse> rows = orderRepository.findHistory(userId, Set.of("PENDING"), EARLIEST, LATEST);

        assertEquals(List.of(middlePending), ids(rows));
    }

    @Test
    void dateRangeAloneNarrowsResults() {
        List<OrderHistoryResponse> rows = orderRepository.findHistory(userId, ALL,
                Instant.parse("2026-09-10T00:00:00Z"), Instant.parse("2026-09-30T00:00:00Z"));

        assertEquals(List.of(newestRejected, middlePending), ids(rows));
    }

    @Test
    void statusAndDateRangeCombine() {
        List<OrderHistoryResponse> rows = orderRepository.findHistory(userId, Set.of("FILLED", "PENDING"),
                Instant.parse("2026-09-10T00:00:00Z"), Instant.parse("2026-09-30T00:00:00Z"));

        assertEquals(List.of(middlePending), ids(rows));
    }
}
