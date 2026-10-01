package com.neueda.leap.portfolio.controller;

import com.neueda.leap.portfolio.dto.CashBalanceResponse;
import com.neueda.leap.portfolio.dto.HoldingResponse;
import com.neueda.leap.portfolio.dto.OrderSummaryResponse;
import com.neueda.leap.portfolio.dto.PortfolioSummaryResponse;
import com.neueda.leap.portfolio.service.ClientFinancialQueryService;
import com.neueda.leap.security.JwtPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** Client-scoped read endpoints for holdings, cash, and order history. */
@RestController
@RequestMapping("/api/v1")
@PreAuthorize("hasAnyRole('TRADER', 'ANALYST')")
@SecurityRequirement(name = "bearerAuth")
public class ClientFinancialController {

    private final ClientFinancialQueryService queryService;

    /**
     * Creates the portfolio endpoints.
     * @param queryService queries restricted to the authenticated user's accounts
     */
    public ClientFinancialController(ClientFinancialQueryService queryService) {
        this.queryService = queryService;
    }

    /**
     * Lists holdings owned by the authenticated caller.
     * @param principal identity supplied by Spring Security
     * @return HTTP 200 with owned holdings, including an empty list when absent
     */
    @Tag(name = "Holdings", description = "Endpoints for retrieving security holdings")
    @Operation(
        summary = "Get user's holdings",
        description = "Lists all securities held by the authenticated user across their accounts"
    )
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Holdings retrieved successfully"),
        @ApiResponse(responseCode = "401", description = "Unauthorized - missing or invalid token")
    })
    @GetMapping("/holdings")
    public ResponseEntity<List<HoldingResponse>> holdings(
            @AuthenticationPrincipal JwtPrincipal principal) {
        return ResponseEntity.ok(queryService.getHoldings(principal.userId()));
    }

    /**
     * Lists the caller's holdings through the client-addressed route.
     * @param id client user identity, checked against the validated JWT
     * @param principal identity supplied by Spring Security
     * @return HTTP 200 with owned holdings
     * @throws ResponseStatusException when the requested client is not the caller
     */
    @Tag(name = "Holdings", description = "Endpoints for retrieving security holdings")
    @Operation(
        summary = "Get client's holdings by ID",
        description = "Lists all securities held by a specific client (must be authenticated as that client)"
    )
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Holdings retrieved successfully"),
        @ApiResponse(responseCode = "403", description = "Forbidden - cannot access other user's holdings"),
        @ApiResponse(responseCode = "401", description = "Unauthorized - missing or invalid token")
    })
    @GetMapping("/clients/{id}/holdings")
    public ResponseEntity<List<HoldingResponse>> clientHoldings(
            @PathVariable("id") UUID id,
            @AuthenticationPrincipal JwtPrincipal principal) {
        if (!principal.userId().equals(id)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return ResponseEntity.ok(queryService.getHoldings(principal.userId()));
    }

    /**
     * Lists cash balances owned by the authenticated caller.
     * @param principal identity supplied by Spring Security
     * @return HTTP 200 with owned balances, including an empty list when absent
     */
    @Tag(name = "Cash", description = "Endpoints for retrieving account cash balances")
    @Operation(
        summary = "Get user's cash balance",
        description = "Lists cash balance across all accounts for the authenticated user"
    )
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Cash balance retrieved successfully"),
        @ApiResponse(responseCode = "401", description = "Unauthorized - missing or invalid token")
    })
    @GetMapping("/cash")
    public ResponseEntity<List<CashBalanceResponse>> cash(
            @AuthenticationPrincipal JwtPrincipal principal) {
        return ResponseEntity.ok(queryService.getCashBalances(principal.userId()));
    }

    /**
     * Lists order history owned by the authenticated caller.
     * @param principal identity supplied by Spring Security
     * @return HTTP 200 with owned orders, including an empty list when absent
     */
    @Tag(name = "Orders", description = "Endpoints for retrieving order history and status")
    @Operation(
        summary = "Get user's orders",
        description = "Lists all orders submitted by the authenticated user, sorted by submission time (newest first)"
    )
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Orders retrieved successfully"),
        @ApiResponse(responseCode = "401", description = "Unauthorized - missing or invalid token")
    })
    @GetMapping("/orders")
    public ResponseEntity<List<OrderSummaryResponse>> orders(
            @AuthenticationPrincipal JwtPrincipal principal) {
        return ResponseEntity.ok(queryService.getOrders(principal.userId()));
    }

    /**
     * TS-11.3 AC1: Returns combined portfolio summary for a client.
     * Includes holdings, cash (with settlement distinction), and total portfolio value.
     * 
     * @param clientId client user identity, checked against the validated JWT
     * @param principal identity supplied by Spring Security
     * @return HTTP 200 with portfolio summary
     * @throws ResponseStatusException when the requested client is not the caller
     */
    @Tag(name = "Portfolio", description = "Combined portfolio endpoints returning aggregated financial data")
    @Operation(
        summary = "Get portfolio summary",
        description = "Returns combined view of holdings, cash balance (settled/pending/available), and total portfolio value. TS-11.3 AC1: One endpoint combining portfolio and summary data."
    )
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Portfolio summary retrieved successfully"),
        @ApiResponse(responseCode = "403", description = "Forbidden - cannot access other user's portfolio"),
        @ApiResponse(responseCode = "404", description = "Not found - user has no accounts"),
        @ApiResponse(responseCode = "401", description = "Unauthorized - missing or invalid token")
    })
    @GetMapping("/clients/{clientId}/portfolio-summary")
    public ResponseEntity<PortfolioSummaryResponse> getPortfolioSummary(
            @PathVariable("clientId") UUID clientId,
            @AuthenticationPrincipal JwtPrincipal principal) {
        
        if (!principal.userId().equals(clientId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        
        // If accountId is not provided, use the first available account
        // In a multi-account system, this would be selected differently
        UUID targetAccountId = null;
        
        // Get all holdings and extract first account
        List<HoldingResponse> holdings = queryService.getHoldings(principal.userId());
        if (!holdings.isEmpty()) {
            targetAccountId = holdings.get(0).accountId();
        } else {
            // Try to get from cash
            List<CashBalanceResponse> cashList = queryService.getCashBalances(principal.userId());
            if (!cashList.isEmpty()) {
                targetAccountId = cashList.get(0).accountId();
            } else {
                // No accounts found
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No accounts found for user");
            }
        }
        
        return ResponseEntity.ok(queryService.getPortfolioSummary(principal.userId(), targetAccountId));
    }
}
