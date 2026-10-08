package com.neueda.leap.order.settlement;

/** A record that a complete settlement of one fill must have (BR-09). */
public enum SettlementPart {
    /** The holdings ledger row; inserting it also updates the holdings projection. */
    HOLDING_MOVEMENT,
    /** The cash ledger row, paired with the change to the cash balance. */
    CASH_TRANSACTION,
    /** The order marked FILLED with its status history entry. */
    ORDER_STATUS,
    /** The SETTLEMENT_COMPLETED audit entry. */
    COMPLETION_AUDIT
}
