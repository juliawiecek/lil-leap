package com.neueda.leap.order.submission;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
class AdvancedOrderValidationTest {
    private SubmitOrderRequest request(String type, BigDecimal limit, BigDecimal stop) {
        return new SubmitOrderRequest(UUID.randomUUID(), "AAPL", UUID.randomUUID(), "BUY", 2, type, null, null, limit, null, stop);
    }
    @Test void validatesRequiredLimitAndPositiveExitPrices() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertThat(validator.validate(request("LIMIT", null, null))).isNotEmpty();
            assertThat(validator.validate(request("MARKET", BigDecimal.TEN, null))).isNotEmpty();
            assertThat(validator.validate(request("LIMIT", BigDecimal.TEN, BigDecimal.ZERO))).isNotEmpty();
            assertThat(validator.validate(request("LIMIT", BigDecimal.TEN, BigDecimal.ONE))).isEmpty();
        }
    }
}
