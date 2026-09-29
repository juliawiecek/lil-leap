package com.neueda.leap.order.controller;

import com.neueda.leap.order.dto.OrderSubmissionResponse;
import com.neueda.leap.order.dto.SubmitOrderRequest;
import com.neueda.leap.order.service.OrderSubmissionService;
import com.neueda.leap.security.JwtPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes order submission at {@code POST /orders}.
 */
@RestController
@RequestMapping("/orders")
public class OrderController {

    private final OrderSubmissionService submissionService;

    /**
     * Creates the order controller.
     *
     * @param submissionService service that validates and persists submissions
     */
    public OrderController(OrderSubmissionService submissionService) {
        this.submissionService = submissionService;
    }

    /**
     * Submits a market order on behalf of the authenticated caller.
     *
     * @param principal authenticated identity from the bearer token
     * @param request submission payload, validated before this method runs
     * @return HTTP 201 with the created order's identifier and status
     */
    @PostMapping
    public ResponseEntity<OrderSubmissionResponse> submit(@AuthenticationPrincipal JwtPrincipal principal,
                                                          @Valid @RequestBody SubmitOrderRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(submissionService.submit(principal.userId(), request));
    }
}
