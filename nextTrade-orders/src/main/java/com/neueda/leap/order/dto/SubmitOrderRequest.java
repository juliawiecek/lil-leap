package com.neueda.leap.order.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

import java.util.UUID;

/**
 * Payload for submitting a market order.
 * BR-04: a client submits an order to buy or sell a supported instrument.
 *
 * @param accountId account placing the order; must belong to the caller
 * @param instrumentId instrument being traded
 * @param side BUY or SELL, case-insensitive
 * @param quantity number of units, greater than zero
 * @param clientReference optional caller-supplied idempotency key; generated when absent
 */
public record SubmitOrderRequest(
        @NotNull(message = "accountId is required") UUID accountId,
        @NotNull(message = "instrumentId is required") UUID instrumentId,
        @NotBlank(message = "side is required")
        @Pattern(regexp = "(?i)BUY|SELL", message = "side must be BUY or SELL") String side,
        @NotNull(message = "quantity is required")
        @Positive(message = "quantity must be greater than zero") Long quantity,
        UUID clientReference) {
}
