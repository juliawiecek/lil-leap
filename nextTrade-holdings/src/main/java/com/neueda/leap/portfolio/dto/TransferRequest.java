package com.neueda.leap.portfolio.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Moves settled USD cash between two of the caller's own accounts (PS-05).
 * @param fromAccountId account the cash leaves
 * @param toAccountId account the cash arrives in
 * @param amount positive USD amount with at most two decimal places
 */
public record TransferRequest(
        @NotNull UUID fromAccountId,
        @NotNull UUID toAccountId,
        @NotNull @DecimalMin("0.01") @DecimalMax("1000000000.00") @Digits(integer = 12, fraction = 2) BigDecimal amount
) {
}
