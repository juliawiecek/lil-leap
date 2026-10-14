package com.neueda.leap.portfolio.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A completed internal book transfer.
 * @param transferId identifier recorded in the CASH_TRANSFER audit event
 * @param fromAccountId account the cash left
 * @param toAccountId account the cash arrived in
 * @param amount USD moved
 * @param fromBalance source account cash after the transfer
 * @param toBalance target account cash after the transfer
 * @param transferredAt when the transfer committed
 */
public record TransferResponse(
        UUID transferId,
        UUID fromAccountId,
        UUID toAccountId,
        BigDecimal amount,
        BigDecimal fromBalance,
        BigDecimal toBalance,
        Instant transferredAt
) {
}
