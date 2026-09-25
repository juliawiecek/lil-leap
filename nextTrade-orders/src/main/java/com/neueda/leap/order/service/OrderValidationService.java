package com.neueda.leap.order.service;

import com.neueda.leap.order.model.Order;
import org.springframework.stereotype.Service;

/**
 * Service responsible for validating {@link Order} objects.
 *
 * <p>This service checks that an order contains valid market order data:
 * - Order ID is not null
 * - Account and Instrument are set
 * - Side is BUY or SELL
 * - Quantity is greater than zero
 * - Order type is MARKET
 * - Status is nonblank</p>
 */
@Service
public class OrderValidationService {

    /** Creates the order field validator. */
    public OrderValidationService() {
    }

    /**
     * Validates the provided order.
     *
     * @param order the order to validate
     * @throws IllegalArgumentException if any required field is invalid
     */
    public void validate(Order order) {
        if (order == null) {
            throw new IllegalArgumentException("Order must not be null");
        }
        if (order.getOrderId() == null) {
            throw new IllegalArgumentException("Order ID must not be null");
        }
        if (order.getAccount() == null) {
            throw new IllegalArgumentException("Account must not be null");
        }
        if (order.getInstrument() == null) {
            throw new IllegalArgumentException("Instrument must not be null");
        }
        if (order.getSide() == null || order.getSide().isBlank()) {
            throw new IllegalArgumentException("Side must not be blank (BUY or SELL)");
        }
        if (!("BUY".equalsIgnoreCase(order.getSide()) || "SELL".equalsIgnoreCase(order.getSide()))) {
            throw new IllegalArgumentException("Side must be BUY or SELL");
        }
        if (order.getQuantity() == null || order.getQuantity() <= 0) {
            throw new IllegalArgumentException("Quantity must be greater than zero");
        }
        if (order.getOrderType() == null || order.getOrderType().isBlank()) {
            throw new IllegalArgumentException("Order type must not be blank");
        }
        if (!"MARKET".equalsIgnoreCase(order.getOrderType())) {
            throw new IllegalArgumentException("Order type must be MARKET");
        }
        if (order.getStatus() == null || order.getStatus().isBlank()) {
            throw new IllegalArgumentException("Status must not be blank");
        }
    }
}

