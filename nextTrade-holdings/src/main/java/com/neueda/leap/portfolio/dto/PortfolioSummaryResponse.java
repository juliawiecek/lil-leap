package com.neueda.leap.portfolio.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Combined portfolio summary for a client.
 * TS-11.3 AC1: Returns holdings, cash balance, and total portfolio value in one response.
 *
 * @param accountId account owning the portfolio
 * @param holdings list of current holdings
 * @param cash detailed cash balance with settlement distinction
 * @param totalPortfolioValue sum of all holdings' current market value plus total cash (settled and pending)
 * @param updatedAt timestamp when this summary was generated
 */
public record PortfolioSummaryResponse(
        UUID accountId,
        List<HoldingResponse> holdings,
        CashBalanceDetailResponse cash,
        BigDecimal totalPortfolioValue,
        Instant updatedAt
) {
}
