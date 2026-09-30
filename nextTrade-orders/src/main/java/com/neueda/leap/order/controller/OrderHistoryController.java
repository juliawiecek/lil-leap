package com.neueda.leap.order.controller;

import com.neueda.leap.order.dto.OrderHistoryResponse;
import com.neueda.leap.order.exception.ClientNotFoundException;
import com.neueda.leap.order.service.OrderHistoryService;
import com.neueda.leap.security.JwtPrincipal;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Exposes a client's order history at {@code GET /clients/{id}/orders} with optional,
 * combinable {@code ?from=}, {@code ?to=} (ISO dates) and {@code ?status=} filters.
 */
@RestController
@PreAuthorize("hasRole('TRADER')")
public class OrderHistoryController {

    private final OrderHistoryService historyService;

    /**
     * Creates the order history controller.
     *
     * @param historyService service that reads order history
     */
    public OrderHistoryController(OrderHistoryService historyService) {
        this.historyService = historyService;
    }

    /**
     * Returns the caller's own orders, newest first.
     * A path id other than the caller's own returns 404, identically to an unknown id (BR-02).
     *
     * @param id client (user) identifier; must be the caller's own
     * @param from first day to include, e.g. 2026-09-01
     * @param to last day to include
     * @param status one order status, e.g. FILLED
     * @param principal authenticated identity from the bearer token
     * @return HTTP 200 with the matching orders
     */
    @GetMapping("/clients/{id}/orders")
    public ResponseEntity<List<OrderHistoryResponse>> getOrders(
            @PathVariable UUID id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String status,
            @AuthenticationPrincipal JwtPrincipal principal) {
        if (!id.equals(principal.userId())) {
            throw new ClientNotFoundException("Client not found");
        }
        return ResponseEntity.ok(historyService.getHistory(principal.userId(), from, to, status));
    }
}
