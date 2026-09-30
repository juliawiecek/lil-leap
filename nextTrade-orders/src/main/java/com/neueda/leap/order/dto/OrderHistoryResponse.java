package com.neueda.leap.order.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One row of a client's order history.
 * BR-11: a chronological history of the client's own orders and fills.
 *
 * @param orderId identifier of the order
 * @param symbol ticker of the instrument traded
 * @param side BUY or SELL
 * @param quantity number of units ordered
 * @param status current lifecycle status
 * @param submittedAt when the order was submitted
 * @param fillPrice price per unit the order filled at; null until filled
 * @param filledQuantity units filled; null until filled
 * @param filledAt when the order filled; null until filled
 */
public record OrderHistoryResponse(UUID orderId, String symbol, String side, Long quantity, String status,
                                   Instant submittedAt, BigDecimal fillPrice, Long filledQuantity,
                                   Instant filledAt) {
}
