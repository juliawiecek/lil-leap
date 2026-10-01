package com.neueda.leap.order.repository;

import com.neueda.leap.order.dto.OrderHistoryResponse;
import com.neueda.leap.order.model.Account;
import com.neueda.leap.order.model.Fill;
import com.neueda.leap.order.model.Instrument;
import com.neueda.leap.order.model.Order;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Runs the NEXT-117 order history query against an in-memory database, so ordering and
 * filtering are verified by the real query rather than by a mock.
 */
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class OrderHistoryRepositoryTest {

    private static final Set<String> ALL = Set.of("SUBMITTED", "ACCEPTED", "PENDING", "DELAYED", "FILLED", "REJECTED");
    private static final Instant EARLIEST = Instant.EPOCH;
    private static final Instant LATEST = Instant.parse("9999-12-31T00:00:00Z");

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private OrderRepository orderRepository;

    private final UUID userId = UUID.randomUUID();
    private Account account;
    private Instrument instrument;
    private UUID oldFilled;
    private UUID middlePending;
    private UUID newestRejected;

    @BeforeEach
    void setUp() {
        // accounts.user_id references users, which this test does not need to populate.
        entityManager.createNativeQuery("SET REFERENTIAL_INTEGRITY FALSE").executeUpdate();
        account = account(userId);
        instrument = new Instrument(UUID.randomUUID(), "AAPL", "Apple Inc.", "COMMON_STOCK", "NASDAQ", "USD", true, true);
        entityManager.persist(account);
        entityManager.persist(instrument);

        oldFilled = order(account, "FILLED", "2026-09-01T10:00:00Z");
        middlePending = order(account, "PENDING", "2026-09-15T10:00:00Z");
        newestRejected = order(account, "REJECTED", "2026-09-29T10:00:00Z");
        entityManager.persist(new Fill(UUID.randomUUID(), entityManager.find(Order.class, oldFilled), 5L,
                new BigDecimal("150.25"), Instant.parse("2026-09-01T10:00:01Z")));

        Account otherAccount = account(UUID.randomUUID());
        entityManager.persist(otherAccount);
        order(otherAccount, "FILLED", "2026-09-20T10:00:00Z");
        entityManager.flush();
        entityManager.clear();
    }

    private static Account account(UUID owner) {
        return new Account(UUID.randomUUID(), owner, "ACC-" + owner.toString().substring(0, 8), "Test",
                "INDIVIDUAL_CASH", "ACTIVE", "NOVICE", BigDecimal.ZERO, new BigDecimal("2.00"));
    }

    private UUID order(Account owner, String status, String submittedAt) {
        Order order = new Order(UUID.randomUUID(), owner, instrument, UUID.randomUUID(), "BUY", 5L, "MARKET", status);
        entityManager.persist(order);
        entityManager.flush();
        // submitted_at is set on insert; move it to the time this scenario needs.
        entityManager.createQuery("UPDATE Order o SET o.submittedAt = :at WHERE o.orderId = :id")
                .setParameter("at", Instant.parse(submittedAt))
                .setParameter("id", order.getOrderId())
                .executeUpdate();
        return order.getOrderId();
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
