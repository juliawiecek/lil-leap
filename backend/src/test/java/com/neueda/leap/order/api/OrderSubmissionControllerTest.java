package com.neueda.leap.order.api;

import com.neueda.leap.order.api.dto.CreateOrderRequest;
import com.neueda.leap.order.api.dto.OrderResponse;
import com.neueda.leap.order.service.OrderSubmissionResult;
import com.neueda.leap.order.service.OrderSubmissionService;
import com.neueda.leap.security.JwtPrincipal;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrderSubmissionControllerTest {

    @Test
    void newOrderReturns201AndUsesAuthenticatedIdentity() {
        OrderSubmissionService service = mock(OrderSubmissionService.class);
        OrderSubmissionController controller = new OrderSubmissionController(service);
        UUID userId = UUID.randomUUID();
        CreateOrderRequest request = request();
        OrderResponse response = response(request);
        when(service.submit(userId, request)).thenReturn(new OrderSubmissionResult(response, true));

        ResponseEntity<OrderResponse> result = controller.submit(
                new JwtPrincipal(userId, "synthetic@example.test"), request);

        assertEquals(HttpStatus.CREATED, result.getStatusCode());
        verify(service).submit(userId, request);
    }

    @Test
    void idempotentReplayReturns200() {
        OrderSubmissionService service = mock(OrderSubmissionService.class);
        OrderSubmissionController controller = new OrderSubmissionController(service);
        UUID userId = UUID.randomUUID();
        CreateOrderRequest request = request();
        OrderResponse response = response(request);
        when(service.submit(userId, request)).thenReturn(new OrderSubmissionResult(response, false));

        ResponseEntity<OrderResponse> result = controller.submit(
                new JwtPrincipal(userId, "synthetic@example.test"), request);

        assertEquals(HttpStatus.OK, result.getStatusCode());
    }

    private static CreateOrderRequest request() {
        return new CreateOrderRequest(
                UUID.randomUUID(), "AAPL", UUID.randomUUID(), "BUY", 10L,
                "MARKET", new BigDecimal("2.00"));
    }

    private static OrderResponse response(CreateOrderRequest request) {
        return new OrderResponse(
                UUID.randomUUID(), request.accountId(), UUID.randomUUID(), "AAPL",
                request.clientReference(), request.side(), request.quantity(),
                request.orderType(), "SUBMITTED", Instant.now(), request.bufferPercent());
    }
}
