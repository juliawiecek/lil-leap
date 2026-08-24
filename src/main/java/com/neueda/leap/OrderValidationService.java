package com.neueda.leap;

import org.springframework.stereotype.Service;

@Service
public class OrderValidationService {

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
