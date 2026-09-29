package com.neueda.leap.order.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Field-level validation tests for SubmitOrderRequest (NEXT-189 AC3).
 */
class SubmitOrderRequestValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUpValidator() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void closeValidator() {
        factory.close();
    }

    private static SubmitOrderRequest request(String side, Long quantity) {
        return new SubmitOrderRequest(UUID.randomUUID(), UUID.randomUUID(), side, quantity, null);
    }

    private static Set<String> messages(SubmitOrderRequest request) {
        return validator.validate(request).stream()
                .map(ConstraintViolation::getMessage)
                .collect(Collectors.toSet());
    }

    @Test
    void acceptsBuyAndSellInAnyCase() {
        assertTrue(messages(request("BUY", 1L)).isEmpty());
        assertTrue(messages(request("sell", 1L)).isEmpty());
    }

    @Test
    void rejectsUnknownSide() {
        assertEquals(Set.of("side must be BUY or SELL"), messages(request("HOLD", 1L)));
    }

    @Test
    void rejectsZeroAndNegativeQuantity() {
        assertEquals(Set.of("quantity must be greater than zero"), messages(request("BUY", 0L)));
        assertEquals(Set.of("quantity must be greater than zero"), messages(request("BUY", -5L)));
    }

    @Test
    void rejectsMissingRequiredFields() {
        Set<String> messages = messages(new SubmitOrderRequest(null, null, null, null, null));
        assertTrue(messages.containsAll(Set.of("accountId is required", "instrumentId is required",
                "side is required", "quantity is required")));
    }
}
