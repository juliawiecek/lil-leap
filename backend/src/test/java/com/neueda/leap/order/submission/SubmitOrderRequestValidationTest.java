package com.neueda.leap.order.submission;

import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SubmitOrderRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void validRequestPassesValidation() {
        var request = new SubmitOrderRequest(UUID.randomUUID(), "AAPL", UUID.randomUUID(),
                "BUY", 10, "MARKET", null);
        assertTrue(validator.validate(request).isEmpty());
    }

    @Test
    void malformedRequestsAreRejected() {
        var request = new SubmitOrderRequest(null, "", null, "HOLD", 0, "LIMIT", null);
        assertFalse(validator.validate(request).isEmpty());
    }
}
