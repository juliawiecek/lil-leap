package com.neueda.leap.order.service;

import com.neueda.leap.order.model.Order;

/**
 * Contract for validating order payloads.
 */
public interface OrderValidationService {

    /**
     * Validates the provided order payload.
     *
     * @param order the order to validate
     * @throws IllegalArgumentException when any order field violates business constraints
     */
    void validate(Order order);
}
