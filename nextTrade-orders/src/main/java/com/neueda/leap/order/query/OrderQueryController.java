package com.neueda.leap.order.query;

import com.neueda.leap.security.JwtPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.UUID;

/**
 * Exposes a single order at {@code GET /api/v1/orders/{id}} and its status at
 * {@code GET /api/v1/orders/{id}/status}. Another user's order returns 404, identically
 * to an unknown id.
 */
@RestController
@RequestMapping("/orders")
public class OrderQueryController {

    private final OrderQueryService service;

    /**
     * Creates the order query endpoints.
     * @param service caller-scoped order reads
     */
    public OrderQueryController(OrderQueryService service) {
        this.service = service;
    }

    /**
     * Returns the full detail of one of the caller's orders.
     * @param principal authenticated identity supplied by Spring Security
     * @param id order identifier
     * @return HTTP 200 with the order and its fill, if any
     */
    @GetMapping("/{id}")
    public ResponseEntity<OrderDetailResponse> detail(
            @AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID id) {
        return ResponseEntity.ok(service.getDetail(id, principal.userId()));
    }

    /**
     * Returns the current status of one of the caller's orders and its latest status reason.
     * @param principal authenticated identity supplied by Spring Security
     * @param id order identifier
     * @return HTTP 200 with the status and its most recent reason code
     */
    @GetMapping("/{id}/status")
    public ResponseEntity<OrderStatusResponse> status(
            @AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID id) {
        return ResponseEntity.ok(service.getStatus(id, principal.userId()));
    }
}
