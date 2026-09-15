package com.neueda.leap.order.submission.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.util.UUID;

public record SubmitOrderRequest(
        @NotNull UUID accountId,
        @NotBlank @Pattern(regexp = "^[A-Za-z0-9.-]{1,20}$") String symbol,
        @NotNull UUID clientReference,
        @NotBlank @Pattern(regexp = "(?i)BUY|SELL") String side,
        @Positive long quantity,
        @Pattern(regexp = "(?i)MARKET") String orderType,
        @DecimalMin(value = "0.0", inclusive = true) BigDecimal bufferPercent
) {
    public String normalizedSymbol() {
        return symbol.trim().toUpperCase();
    }

    public String normalizedSide() {
        return side.trim().toUpperCase();
    }

    public String normalizedOrderType() {
        return orderType == null || orderType.isBlank() ? "MARKET" : orderType.trim().toUpperCase();
    }
}
