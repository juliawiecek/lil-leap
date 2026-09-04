package com.neueda.leap;

import org.springframework.stereotype.Service;

/**
 * Service responsible for validating {@link Order} objects.
 *
 * <p>This service checks that an order contains a non-blank product name,
 * a quantity greater than zero, and a non-negative price.</p>
 */
@Service
public class OrderValidationService {

    /**
     * Validates the provided order.
     *
     * @param order the order to validate
     * @throws IllegalArgumentException if the product name is blank, the quantity
     *                                  is less than or equal to zero, or the price
     *                                  is negative
     */
    public void validate(Order order) {
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