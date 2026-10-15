package com.neueda.leap.portfolio.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A newly opened account.
 * @param accountId account identifier
 * @param accountNumber customer-facing account number
 * @param nickname the name the client chose
 * @param accountType always INDIVIDUAL_CASH for now
 * @param currency always USD for now
 * @param status ACTIVE for a new account
 * @param tradingEnabled whether orders may be placed from the account
 * @param cashBalance cash in the account; zero when opened
 * @param createdAt when the account was opened
 */
public record AccountResponse(
        UUID accountId,
        String accountNumber,
        String nickname,
        String accountType,
        String currency,
        String status,
        boolean tradingEnabled,
        BigDecimal cashBalance,
        Instant createdAt
) {
}
