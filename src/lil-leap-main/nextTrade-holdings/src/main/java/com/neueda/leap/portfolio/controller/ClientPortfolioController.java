package com.neueda.leap.portfolio.controller;

import com.neueda.leap.portfolio.dto.HoldingResponse;
import com.neueda.leap.portfolio.service.ClientPortfolioQueryService;
import com.neueda.leap.security.JwtPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/**
 * Client-scoped read endpoints for portfolio holdings.
 *
 * <p>TS-11.1c: Single holding lookup (GET /holdings/{accountId}/{instrumentId})
 * returns detail for one holding, scoped to the authenticated caller.
 * AC2: Requesting another client's holding returns 404.</p>
 * 
 * <p>Nginx routing strips /api/holdings/ prefix, so endpoints are at root level.</p>
 */
@RestController
@RequestMapping("")
@PreAuthorize("hasAnyRole('TRADER', 'ANALYST')")
@SecurityRequirement(name = "bearerAuth")
public class ClientPortfolioController {

    private final ClientPortfolioQueryService queryService;

    /**
     * Creates the portfolio controller.
     *
     * @param queryService queries restricted to the authenticated user's accounts
     */
    public ClientPortfolioController(ClientPortfolioQueryService queryService) {
        this.queryService = queryService;
    }

    /**
     * TS-11.1c AC1: Returns detail for one holding by account and instrument.
     *
     * <p>TS-11.1c AC2: Requesting another client's holding ID returns 404.
     * The not-found response prevents information leakage: a client cannot
     * distinguish between "holding doesn't exist" and "you don't own this account".</p>
     *
     * <p>Depends on TS-11.1 (NEXT-115) for the underlying holdings query.</p>
     *
     * @param accountId account containing the holding, checked against the validated JWT
     * @param instrumentId instrument being held
     * @param principal identity supplied by Spring Security
     * @return HTTP 200 with holding detail
     * @throws ResponseStatusException 404 when the requested holding does not exist
     *         or does not belong to the authenticated caller
     */
    @Tag(name = "Holdings", description = "Endpoints for retrieving security holdings")
    @Operation(
        summary = "Get specific holding by account and instrument",
        description = "Returns detail for a single holding owned by the authenticated user. " +
                      "TS-11.1c AC1: GET /holdings/{accountId}/{instrumentId} scoped to caller. " +
                      "Returns 404 if the holding does not exist or belongs to another client."
    )
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Holding retrieved successfully"),
        @ApiResponse(responseCode = "404", description = "Holding not found or belongs to another user"),
        @ApiResponse(responseCode = "401", description = "Unauthorized - missing or invalid token")
    })
    @GetMapping("/holdings/{accountId}/{instrumentId}")
    public ResponseEntity<HoldingResponse> getHolding(
            @PathVariable("accountId") UUID accountId,
            @PathVariable("instrumentId") UUID instrumentId,
            @AuthenticationPrincipal JwtPrincipal principal) {
        
        return queryService.getHoldingByIdScoped(principal.userId(), accountId, instrumentId)
                .map(ResponseEntity::ok)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Holding not found"));
    }
}
