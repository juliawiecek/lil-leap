package com.neueda.leap.order.settlement;

import java.util.UUID;

/**
 * Ledger-derived settlement state for one trade/order.
 *
 * @param tradeId the permanent order/trade identifier that was looked up
 * @param status {@code SETTLED}, {@code NOT_SETTLED}, {@code REJECTED} or {@code INCONSISTENT}
 * @param settlementId the fill that settled the trade, or {@code null} when it never filled
 */
public record SettlementStatusResponse(UUID tradeId, String status, UUID settlementId) {
}