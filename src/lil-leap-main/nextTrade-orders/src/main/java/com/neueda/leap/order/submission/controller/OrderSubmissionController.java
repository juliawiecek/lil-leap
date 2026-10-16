package com.neueda.leap.order.submission.controller;

import com.neueda.leap.order.submission.dto.OrderSubmissionResponse;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.service.OrderSubmissionResult;
import com.neueda.leap.order.submission.service.OrderSubmissionService;
import com.neueda.leap.security.JwtPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Exposes authenticated order submission at {@code POST /api/v1/orders}. */
@RestController
@RequestMapping("/orders")
public class OrderSubmissionController {

    private final OrderSubmissionService service;

    /**
     * Creates the order submission endpoint.
     * @param service ownership and idempotency checks for submissions
     */
    public OrderSubmissionController(OrderSubmissionService service) {
        this.service = service;
    }

    /**
     * Submits a validated order on behalf of the authenticated caller.
     * @param principal authenticated identity supplied by Spring Security
     * @param request submission payload validated before this method is called
     * @return HTTP 201 for a new order or HTTP 200 for an existing retry
     */
    @PostMapping
    public ResponseEntity<OrderSubmissionResponse> submit(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody SubmitOrderRequest request) {
        OrderSubmissionResult result = service.submit(principal.userId(), request);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(result.order());
    }
}
