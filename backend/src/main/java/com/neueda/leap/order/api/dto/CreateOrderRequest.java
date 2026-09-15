package com.neueda.leap.order.api.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

/** Request for submitting a whole-unit market order. */
public record CreateOrderRequest(
        @NotNull UUID accountId,
        @NotBlank @Size(max = 20) String symbol,
        @NotNull UUID clientReference,
        @NotBlank @Pattern(regexp = "BUY|SELL", message = "side must be BUY or SELL") String side,
        @NotNull @Positive Long quantity,
        @NotBlank @Pattern(regexp = "MARKET", message = "orderType must be MARKET") String orderType,
        @DecimalMin(value = "0.0", inclusive = true) BigDecimal bufferPercent
) {
}
