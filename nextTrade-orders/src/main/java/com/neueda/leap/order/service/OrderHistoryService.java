package com.neueda.leap.order.service;

import com.neueda.leap.order.dto.OrderHistoryResponse;
import com.neueda.leap.order.exception.InvalidFilterException;
import com.neueda.leap.order.repository.OrderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Reads a client's order history (BR-11).
 *
 * <p>The three filters are independent and optional: {@code from} and {@code to} are
 * calendar days in UTC, both inclusive, and {@code status} is one order status. An
 * omitted filter matches everything, so no filters returns the full history.</p>
 */
@Service
@Transactional(readOnly = true)
public class OrderHistoryService {

    /** Every value allowed by the orders.status check constraint. */
    static final Set<String> ALL_STATUSES =
            Set.of("SUBMITTED", "ACCEPTED", "PENDING", "DELAYED", "FILLED", "REJECTED");

    private static final Instant EARLIEST = Instant.EPOCH;
    private static final Instant LATEST = Instant.parse("9999-12-31T00:00:00Z");

    private final OrderRepository orderRepository;

    /**
     * Creates the order history service.
     *
     * @param orderRepository order persistence
     */
    public OrderHistoryService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    /**
     * Returns the user's orders, newest first, narrowed by any filters supplied.
     *
     * @param userId authenticated user's identifier
     * @param from first day to include (UTC), or null for no lower bound
     * @param to last day to include (UTC), or null for no upper bound
     * @param status status to include, case-insensitive, or null for all statuses
     * @return matching orders with fill details where filled
     * @throws InvalidFilterException if the status is unknown or {@code from} is after {@code to}
     */
    public List<OrderHistoryResponse> getHistory(UUID userId, LocalDate from, LocalDate to, String status) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new InvalidFilterException("from must not be after to");
        }
        Set<String> statuses = ALL_STATUSES;
        if (status != null && !status.isBlank()) {
            String normalized = status.trim().toUpperCase(Locale.ROOT);
            if (!ALL_STATUSES.contains(normalized)) {
                throw new InvalidFilterException("Unknown status: " + status);
            }
            statuses = Set.of(normalized);
        }
        Instant lower = from != null ? from.atStartOfDay(ZoneOffset.UTC).toInstant() : EARLIEST;
        // "to" is a whole day, so the bound is the start of the following day (exclusive).
        Instant upper = to != null ? to.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant() : LATEST;
        return orderRepository.findHistory(userId, statuses, lower, upper);
    }
}
