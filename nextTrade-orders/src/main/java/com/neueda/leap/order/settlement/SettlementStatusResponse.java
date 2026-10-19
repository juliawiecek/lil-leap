package com.neueda.leap.order.settlement;

import java.util.UUID;

/** Ledger-derived settlement state for one trade/order. */
public record SettlementStatusResponse(UUID tradeId, String status, UUID settlementId) {
}