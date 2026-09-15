package com.neueda.leap.order.service;

import com.neueda.leap.order.api.dto.CreateOrderRequest;
import com.neueda.leap.order.api.dto.OrderResponse;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Authenticated, ownership-safe and idempotent order submission. */
@Service
public class OrderSubmissionService {

    private static final String OWNED_ACCOUNT_SQL = """
            SELECT account_id
            FROM accounts
            WHERE account_id = ? AND user_id = ?
            """;

    private static final String INSTRUMENT_SQL = """
            SELECT instrument_id
            FROM instruments
            WHERE UPPER(TRIM(symbol)) = ? AND enabled = TRUE
            ORDER BY tradable DESC, market_code
            LIMIT 1
            """;

    private static final String EXISTING_ORDER_SQL = """
            SELECT o.order_id, o.account_id, o.instrument_id, i.symbol,
                   o.client_reference, o.side, o.quantity, o.order_type,
                   o.status, o.submitted_at, o.buffer_percent
            FROM orders o
            JOIN instruments i ON i.instrument_id = o.instrument_id
            WHERE o.account_id = ? AND o.client_reference = ?
            """;

    private static final String INSERT_ORDER_SQL = """
            INSERT INTO orders(
                order_id, account_id, instrument_id, client_reference,
                side, quantity, order_type, status, submitted_at, updated_at,
                buffer_percent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, ?, ?)
            """;

    private final JdbcTemplate jdbcTemplate;

    public OrderSubmissionService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public OrderSubmissionResult submit(UUID authenticatedUserId, CreateOrderRequest request) {
        if (authenticatedUserId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication is required");
        }

        requireOwnedAccount(request.accountId(), authenticatedUserId);

        OrderResponse existing = findExisting(request.accountId(), request.clientReference());
        if (existing != null) {
            return new OrderSubmissionResult(existing, false);
        }

        String symbol = request.symbol().trim().toUpperCase(Locale.ROOT);
        UUID instrumentId = findInstrument(symbol);
        UUID orderId = UUID.randomUUID();
        Instant submittedAt = Instant.now();

        try {
            jdbcTemplate.update(
                    INSERT_ORDER_SQL,
                    orderId,
                    request.accountId(),
                    instrumentId,
                    request.clientReference(),
                    request.side(),
                    request.quantity(),
                    request.orderType(),
                    Timestamp.from(submittedAt),
                    Timestamp.from(submittedAt),
                    request.bufferPercent()
            );
        } catch (DuplicateKeyException race) {
            OrderResponse replayed = findExisting(request.accountId(), request.clientReference());
            if (replayed != null) {
                return new OrderSubmissionResult(replayed, false);
            }
            throw race;
        }

        OrderResponse created = new OrderResponse(
                orderId,
                request.accountId(),
                instrumentId,
                symbol,
                request.clientReference(),
                request.side(),
                request.quantity(),
                request.orderType(),
                "SUBMITTED",
                submittedAt,
                request.bufferPercent()
        );
        return new OrderSubmissionResult(created, true);
    }

    private void requireOwnedAccount(UUID accountId, UUID userId) {
        List<UUID> matches = jdbcTemplate.query(
                OWNED_ACCOUNT_SQL,
                (rs, rowNum) -> rs.getObject("account_id", UUID.class),
                accountId,
                userId
        );
        if (matches.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found");
        }
    }

    private UUID findInstrument(String symbol) {
        List<UUID> matches = jdbcTemplate.query(
                INSTRUMENT_SQL,
                (rs, rowNum) -> rs.getObject("instrument_id", UUID.class),
                symbol
        );
        if (matches.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported symbol");
        }
        return matches.get(0);
    }

    private OrderResponse findExisting(UUID accountId, UUID clientReference) {
        List<OrderResponse> orders = jdbcTemplate.query(
                EXISTING_ORDER_SQL,
                (rs, rowNum) -> mapOrder(rs),
                accountId,
                clientReference
        );
        return orders.isEmpty() ? null : orders.get(0);
    }

    private static OrderResponse mapOrder(ResultSet rs) throws SQLException {
        return new OrderResponse(
                rs.getObject("order_id", UUID.class),
                rs.getObject("account_id", UUID.class),
                rs.getObject("instrument_id", UUID.class),
                rs.getString("symbol"),
                rs.getObject("client_reference", UUID.class),
                rs.getString("side"),
                rs.getLong("quantity"),
                rs.getString("order_type"),
                rs.getString("status"),
                rs.getTimestamp("submitted_at").toInstant(),
                rs.getBigDecimal("buffer_percent")
        );
    }
}
