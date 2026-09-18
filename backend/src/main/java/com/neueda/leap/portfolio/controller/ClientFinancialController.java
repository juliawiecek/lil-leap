package com.neueda.leap.portfolio.controller;

import com.neueda.leap.portfolio.dto.CashBalanceResponse;
import com.neueda.leap.portfolio.dto.HoldingResponse;
import com.neueda.leap.portfolio.dto.OrderSummaryResponse;
import com.neueda.leap.portfolio.service.ClientFinancialQueryService;
import com.neueda.leap.security.JwtPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Client-scoped read endpoints for holdings, cash, and order history. */
@RestController
@RequestMapping
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
    @GetMapping("/holdings")
    public ResponseEntity<List<HoldingResponse>> holdings(
            @AuthenticationPrincipal JwtPrincipal principal) {
        return ResponseEntity.ok(queryService.getHoldings(principal.userId()));
    }

    /**
     * Lists cash balances owned by the authenticated caller.
     * @param principal identity supplied by Spring Security
     * @return HTTP 200 with owned balances, including an empty list when absent
     */
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
    @GetMapping("/orders")
    public ResponseEntity<List<OrderSummaryResponse>> orders(
            @AuthenticationPrincipal JwtPrincipal principal) {
        return ResponseEntity.ok(queryService.getOrders(principal.userId()));
    }
}
