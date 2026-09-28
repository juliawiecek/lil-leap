package com.neueda.leap.order.submission;

import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import java.util.UUID;
import java.math.BigDecimal;
import java.util.Locale;
import static org.junit.jupiter.api.Assertions.assertEquals;

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
    @Test
    void bufferMustFitDatabasePrecision() {
        for (String value : new String[]{"1000", "1.234"}) {
            var request = new SubmitOrderRequest(UUID.randomUUID(), "AAPL", UUID.randomUUID(),
                    "BUY", 10, "MARKET", new BigDecimal(value));
            assertFalse(validator.validate(request).isEmpty());
        }
    }

    @Test
    void symbolsNormalizeIndependentlyOfServerLocale() {
        Locale original = Locale.getDefault();
        try {
            Locale.setDefault(Locale.forLanguageTag("tr-TR"));
            var request = new SubmitOrderRequest(UUID.randomUUID(), "ibm", UUID.randomUUID(),
                    "buy", 10, null, null);
            assertEquals("IBM", request.normalizedSymbol());
        } finally {
            Locale.setDefault(original);
        }
    }
}
