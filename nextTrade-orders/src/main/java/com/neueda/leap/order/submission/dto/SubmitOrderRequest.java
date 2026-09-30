package com.neueda.leap.order.submission.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.util.UUID;
import java.util.Locale;

/**
 * Input for a market-order submission; Bean Validation runs at the API boundary.
 * @param accountId account that must belong to the authenticated user
 * @param symbol instrument symbol, 1 to 20 letters, digits, dots, or hyphens
 * @param clientReference caller-generated retry key, unique within the account
 * @param side BUY or SELL, case-insensitive
 * @param quantity positive whole-unit quantity
 * @param orderType MARKET, case-insensitive, or null to use MARKET
 * @param bufferPercent optional nonnegative buffer percentage, at most three integer
 *        and two fractional digits; overrides the account default for buying-power
 *        checks without reserving funds at submission
 * @param instrumentId alternative to symbol for catalog-ID submissions
 */
public record SubmitOrderRequest(
        @NotNull UUID accountId,
        @Pattern(regexp = "^[A-Za-z0-9.-]{1,20}$") String symbol,
        @NotNull UUID clientReference,
        @NotBlank @Pattern(regexp = "(?i)BUY|SELL") String side,
        @Positive long quantity,
        @Pattern(regexp = "(?i)MARKET") String orderType,
        @DecimalMin(value = "0.0", inclusive = true) @Digits(integer = 3, fraction = 2) BigDecimal bufferPercent,
        UUID instrumentId
) {
    /**
     * Retains the symbol-based submission constructor.
     * @param accountId caller-owned account
     * @param symbol instrument symbol
     * @param clientReference idempotency key
     * @param side BUY or SELL
     * @param quantity whole-share quantity
     * @param orderType MARKET
     * @param bufferPercent optional execution tolerance
     */
    public SubmitOrderRequest(UUID accountId, String symbol, UUID clientReference, String side,
            long quantity, String orderType, BigDecimal bufferPercent) {
        this(accountId, symbol, clientReference, side, quantity, orderType, bufferPercent, null);
    }

    /**
     * Rejects absent or ambiguous instrument selectors.
     * @return true when exactly one selector is supplied
     */
    @AssertTrue(message = "Supply exactly one of symbol or instrumentId")
    @com.fasterxml.jackson.annotation.JsonIgnore
    public boolean isInstrumentSelectorValid() {
        return (symbol != null && !symbol.isBlank()) != (instrumentId != null);
    }

    /**
     * Returns the canonical symbol after request validation.
     * @return the trimmed, locale-independent uppercase symbol
     */
    public String normalizedSymbol() {
        return symbol.trim().toUpperCase(Locale.ROOT);
    }

    /**
     * Returns the canonical side after request validation.
     * @return BUY or SELL for a validated request
     */
    public String normalizedSide() {
        return side.trim().toUpperCase(Locale.ROOT);
    }

    /**
     * Normalizes the order type, defaulting null or blank input to MARKET.
     * Blank input is rejected by Bean Validation at the API boundary.
     * @return the trimmed uppercase type, or MARKET when absent or blank
     */
    public String normalizedOrderType() {
        return orderType == null || orderType.isBlank() ? "MARKET" : orderType.trim().toUpperCase(Locale.ROOT);
    }
}
