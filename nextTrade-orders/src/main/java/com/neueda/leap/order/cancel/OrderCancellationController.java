package com.neueda.leap.order.cancel;

import com.neueda.leap.order.query.OrderStatusResponse;
import com.neueda.leap.security.JwtPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** {@code POST /orders/{id}/cancel}: the order's owner cancels it while it is still waiting (PS-14). */
@RestController
@RequestMapping("/orders")
public class OrderCancellationController {
    private final OrderCancellationService service;

    /**
     * Creates the controller.
     * @param service cancellation rules and persistence
     */
    public OrderCancellationController(OrderCancellationService service) {
        this.service = service;
    }

    /**
     * Cancels the caller's waiting order.
     * @param principal authenticated trader
     * @param id order to cancel
     * @return 200 with the CANCELLED status; 404 for an unknown or another client's order;
     *         409 when it is executing or already finished
     */
    @PostMapping("/{id}/cancel")
    public ResponseEntity<OrderStatusResponse> cancel(
            @AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID id) {
        return ResponseEntity.ok(service.cancel(id, principal.userId()));
    }
}
