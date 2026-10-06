package com.neueda.leap.portfolio.settlement;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * REST API for settlement recovery and rollback operations (TS-10.3, BR-09).
 * Private/service-only endpoints, not externally callable by clients.
 */
@RestController
@RequestMapping("/settlements")
public class SettlementRecoveryController {
    private final SettlementRecoveryService recoveryService;

    /**
     * Creates a SettlementRecoveryController with the supplied dependencies.
     * @param recoveryService recovery and rollback service
     */
    public SettlementRecoveryController(SettlementRecoveryService recoveryService) {
        this.recoveryService = recoveryService;
    }

    /**
     * Detects and recovers from partially applied settlements (AC2).
     * Implements "ledger wins" rule: when cache and ledger diverge,
     * recomputes cache from ledger. Idempotent and internally callable only.
     *
     * Request: POST /settlements/recover?accountId={uuid}
     *
     * Response:
     * {
     *   "accountId": "{uuid}",
     *   "status": "RECOVERED",
     *   "holdingsReconciled": 2,
     *   "cashReconciled": 1,
     *   "details": "Holdings [abc123]: qty 0→10, cost 0→225.04; ..."
     * }
     *
     * @param accountId UUID of the account to recover
     * @return recovery result with reconciliation details
     */
    @PostMapping("/recover")
    public ResponseEntity<SettlementRecoveryService.RecoveryResult> recover(
            @RequestParam UUID accountId) {

        if (accountId == null) {
            return ResponseEntity.badRequest().build();
        }

        SettlementRecoveryService.RecoveryResult result = recoveryService.recover(accountId);
        return ResponseEntity.ok(result);
    }

    /**
     * Rolls back a settlement by removing cache entries (AC3).
     * Ledger (audit trail) remains intact for reconstruction.
     * Primarily for testing or correcting erroneous settlements.
     *
     * Request: POST /settlements/rollback?accountId={uuid}
     *
     * Response: Same as recover()
     *
     * @param accountId UUID of the account to rollback
     * @return recovery result with rollback details
     */
    @PostMapping("/rollback")
    public ResponseEntity<SettlementRecoveryService.RecoveryResult> rollback(
            @RequestParam UUID accountId) {

        if (accountId == null) {
            return ResponseEntity.badRequest().build();
        }

        SettlementRecoveryService.RecoveryResult result = recoveryService.rollback(accountId);
        return ResponseEntity.ok(result);
    }
}
