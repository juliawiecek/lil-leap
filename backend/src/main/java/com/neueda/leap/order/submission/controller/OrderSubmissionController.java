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

@RestController
@RequestMapping("/orders")
public class OrderSubmissionController {

    private final OrderSubmissionService service;

    public OrderSubmissionController(OrderSubmissionService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<OrderSubmissionResponse> submit(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody SubmitOrderRequest request) {
        OrderSubmissionResult result = service.submit(principal.userId(), request);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(result.order());
    }
}
