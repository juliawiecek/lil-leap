package com.neueda.leap.order.api;

import com.neueda.leap.order.api.dto.CreateOrderRequest;
import com.neueda.leap.order.api.dto.OrderResponse;
import com.neueda.leap.order.service.OrderSubmissionResult;
import com.neueda.leap.order.service.OrderSubmissionService;
import com.neueda.leap.security.JwtPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** POST /api/v1/orders submission endpoint. */
@RestController
public class OrderSubmissionController {

    private final OrderSubmissionService orderService;

    public OrderSubmissionController(OrderSubmissionService orderService) {
        this.orderService = orderService;
    }

    @PostMapping("/orders")
    public ResponseEntity<OrderResponse> submit(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody CreateOrderRequest request) {
        OrderSubmissionResult result = orderService.submit(principal.userId(), request);
        return ResponseEntity
                .status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(result.order());
    }
}
