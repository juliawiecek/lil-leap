package com.neueda.leap.order.settlement;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Operator commands for one settlement (TS-10.3). Service-only: restricted to the OPERATIONS role
 * and not routed by the gateway.
 */
@RestController
@RequestMapping("/settlements")
public class SettlementController {
    private static final Pattern UUID_TEXT =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private final SettlementRecoveryService settlements;

    /**
     * Creates the controller.
     *
     * @param settlements recovery and rollback
     */
    public SettlementController(SettlementRecoveryService settlements) {
        this.settlements = settlements;
    }

    /**
     * Completes a partly applied settlement, e.g. {@code POST /settlements/recover?settlementId={fillId}}.
     *
     * @param settlementId the fill identifier
     * @return 200 with the parts repaired, 400 for a malformed id, 404 for an unknown fill, or 409 when it cannot be completed
     */
    @PostMapping("/recover")
    public ResponseEntity<SettlementResult> recover(@RequestParam(required = false) String settlementId) {
        return ResponseEntity.ok(settlements.recover(parse(settlementId)));
    }

    /**
     * Rolls back a settlement that has not changed any balance.
     *
     * @param settlementId the fill identifier
     * @return 200 when rolled back, 400 for a malformed id, 404 for an unknown fill, or 409 when balances already changed
     */
    @PostMapping("/rollback")
    public ResponseEntity<SettlementResult> rollback(@RequestParam(required = false) String settlementId) {
        return ResponseEntity.ok(settlements.rollback(parse(settlementId)));
    }

    /**
     * Returns the failure's fixed code and message.
     *
     * @param failure recover or rollback failure
     * @return its status with {@code error} and {@code message}
     */
    @ExceptionHandler(SettlementException.class)
    public ResponseEntity<Map<String, String>> handle(SettlementException failure) {
        return ResponseEntity.status(failure.status())
                .body(Map.of("error", failure.code(), "message", failure.getMessage()));
    }

    private static UUID parse(String settlementId) {
        if (settlementId == null || !UUID_TEXT.matcher(settlementId.trim()).matches()) {
            throw new SettlementException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST",
                    "Supply settlementId, the identifier of the fill.");
        }
        return UUID.fromString(settlementId.trim());
    }
}
