package com.neueda.leap.portfolio.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One cash movement that is not a trade, for the activity feed (PS-11).
 * @param transactionId ledger row identifier
 * @param accountId account the cash moved in or out of
 * @param accountName the account's nickname
 * @param type DEPOSIT, WITHDRAWAL, TRANSFER, DIVIDEND, FEE or CORRECTION
 * @param amount signed USD: positive in, negative out
 * @param settlementStatus PENDING or SETTLED
 * @param occurredAt when the movement was recorded
 */
public record CashActivityResponse(
        UUID transactionId,
        UUID accountId,
        String accountName,
        String type,
        BigDecimal amount,
        String settlementStatus,
        Instant occurredAt
) {
}
