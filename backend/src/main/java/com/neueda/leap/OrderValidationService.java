package com.neueda.leap;

import org.springframework.stereotype.Service;

/**
 * Performs preliminary validation of the current order model.
 *
 * <p>The service verifies that an order contains a nonblank product name,
 * a positive quantity, and a nonnegative price.</p>
 *
 * <p>Account ownership, account eligibility, instrument tradability,
 * available cash, available holdings, and quote freshness are outside
 * the current scope of this service.</p>
 */
@Service
public class OrderValidationService {

    /**
     * Validates the basic values contained in an order.
     *
     * @param order the order whose basic values are validated
     * @throws IllegalArgumentException if the order is null, the product
     *         name is blank, the quantity is not positive, or the price
     *         is negative
     */
    public void validate(Order order) {
        if (order == null) {
            throw new IllegalArgumentException("Order must not be null");
        }
        if (order.productName() == null || order.productName().isBlank()) {
            throw new IllegalArgumentException("Product name must not be blank");
        }
        if (order.quantity() <= 0) {
            throw new IllegalArgumentException("Quantity must be greater than zero");
        }
        if (order.price() < 0) {
            throw new IllegalArgumentException("Price must not be negative");
        }
    }
}
