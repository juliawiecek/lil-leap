package com.neueda.leap.order.controller;

import com.neueda.leap.order.dto.CashBalanceResponse;
import com.neueda.leap.order.exception.ClientNotFoundException;
import com.neueda.leap.order.service.CashBalanceQueryService;
import com.neueda.leap.security.JwtPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Exposes cash balance reads at {@code GET /clients/{id}/cash} and
 * {@code GET /cash/balance/{clientId}}.
 *
 * <p>Both routes return the same client-scoped data under different shapes;
 * see TS-11.1b. Either path parameter must match the authenticated caller's
 * own id - a mismatch is reported as 404, identically to an unknown id, so a
 * caller cannot probe for other clients' ids (BR-02).</p>
 */
@RestController
@PreAuthorize("hasAnyRole('TRADER', 'ANALYST')")
@Tag(name = "Cash", description = "Client cash balance reads")
public class CashController {

    private final CashBalanceQueryService queryService;

    /**
     * Creates the cash balance controller.
     *
     * @param queryService service that reads client-scoped cash balances
     */
    public CashController(CashBalanceQueryService queryService) {
        this.queryService = queryService;
    }

    /**
     * Lists cash balances for the given client via the {@code /clients/{id}/cash} shape.
     *
     * @param id requested client id; must match the authenticated caller
     * @param principal authenticated identity from the bearer token
     * @return HTTP 200 with owned balances, including an empty list when absent
     */
    @GetMapping("/clients/{id}/cash")
    @Operation(summary = "Get a client's cash balances",
            description = "id must be the caller's own id - a mismatch returns 404, identically to an unknown id.")
    @ApiResponse(responseCode = "200", description = "Owned balances, or an empty list if none exist")
    @ApiResponse(responseCode = "404", description = "id does not match the authenticated caller")
    public ResponseEntity<List<CashBalanceResponse>> getByClientId(
            @Parameter(description = "Client (user) id; must be the caller's own") @PathVariable UUID id,
            @AuthenticationPrincipal JwtPrincipal principal) {
        return ResponseEntity.ok(getOwnedBalances(id, principal));
    }

    /**
     * Lists cash balances for the given client via the {@code /cash/balance/{clientId}} shape.
     *
     * @param clientId requested client id; must match the authenticated caller
     * @param principal authenticated identity from the bearer token
     * @return HTTP 200 with owned balances, including an empty list when absent
     */
    @GetMapping("/cash/balance/{clientId}")
    @Operation(summary = "Get a client's cash balances (alternate path shape)",
            description = "Same data as GET /clients/{id}/cash under a different URL shape; "
                    + "clientId must be the caller's own id.")
    @ApiResponse(responseCode = "200", description = "Owned balances, or an empty list if none exist")
    @ApiResponse(responseCode = "404", description = "clientId does not match the authenticated caller")
    public ResponseEntity<List<CashBalanceResponse>> getByBalancePath(
            @Parameter(description = "Client (user) id; must be the caller's own") @PathVariable UUID clientId,
            @AuthenticationPrincipal JwtPrincipal principal) {
        return ResponseEntity.ok(getOwnedBalances(clientId, principal));
    }

    private List<CashBalanceResponse> getOwnedBalances(UUID requestedClientId, JwtPrincipal principal) {
        if (!requestedClientId.equals(principal.userId())) {
            throw new ClientNotFoundException("Client not found");
        }
        return queryService.getCashBalances(principal.userId());
    }
}
