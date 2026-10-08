package com.neueda.leap.order.settlement;

import java.util.List;
import java.util.UUID;

/**
 * Outcome of a recover or rollback request.
 *
 * @param settlementId the fill whose settlement was examined
 * @param action RECOVERED, ALREADY_COMPLETE or ROLLED_BACK
 * @param repaired parts written by a recovery; empty for any other action
 */
public record SettlementResult(UUID settlementId, String action, List<SettlementPart> repaired) {
    /** Defensive copy so the result cannot change after it is returned. */
    public SettlementResult {
        repaired = List.copyOf(repaired);
    }
}
