package com.neueda.leap.order.cancel;

import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.order.query.OrderNotFoundException;
import com.neueda.leap.order.query.OrderStatusResponse;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(OrderCancellationController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class})
class OrderCancellationControllerTest {
    @Autowired MockMvc mvc;
    @Autowired JwtServiceImpl tokens;
    @MockBean OrderCancellationService service;

    private final UUID user = UUID.randomUUID();
    private final UUID order = UUID.randomUUID();

    private String token(String role) {
        return "Bearer " + tokens.issueToken(user, "test@example.test", role);
    }

    @Test
    void traderCancelsTheirWaitingOrder() throws Exception {
        when(service.cancel(order, user)).thenReturn(new OrderStatusResponse(order, "CANCELLED",
                "CANCELLED_BY_CLIENT", null, Instant.parse("2026-10-15T12:00:00Z")));
        mvc.perform(post("/orders/{id}/cancel", order).header("Authorization", token("TRADER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value(order.toString()))
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.reasonCode").value("CANCELLED_BY_CLIENT"));
        verify(service).cancel(order, user);
    }

    @Test
    void unknownOrAnotherClientsOrderIsNotFound() throws Exception {
        when(service.cancel(order, user)).thenThrow(new OrderNotFoundException());
        mvc.perform(post("/orders/{id}/cancel", order).header("Authorization", token("TRADER")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("ORDER_NOT_FOUND"));
    }

    @Test
    void executingOrFinishedOrdersAreAConflict() throws Exception {
        when(service.cancel(order, user))
                .thenThrow(new OrderCancellationException(OrderCancellationException.Reason.ORDER_EXECUTING));
        mvc.perform(post("/orders/{id}/cancel", order).header("Authorization", token("TRADER")))
                .andExpect(status().isConflict())
                .andExpect(content().json("{\"error\":\"ORDER_EXECUTING\",\"message\":\"Order is already executing.\"}", true));

        doThrow(new OrderCancellationException(OrderCancellationException.Reason.ORDER_NOT_CANCELLABLE))
                .when(service).cancel(order, user);
        mvc.perform(post("/orders/{id}/cancel", order).header("Authorization", token("TRADER")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("ORDER_NOT_CANCELLABLE"));
    }

    @Test
    void onlySignedInTradersMayCancelAndOnlyByPost() throws Exception {
        mvc.perform(post("/orders/{id}/cancel", order)).andExpect(status().isUnauthorized());
        mvc.perform(post("/orders/{id}/cancel", order).header("Authorization", token("ANALYST")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/orders/{id}/cancel", order).header("Authorization", token("TRADER")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/orders/not-a-uuid/cancel").header("Authorization", token("TRADER")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/orders/{id}/cancel?force=true", order).header("Authorization", token("TRADER")))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }
}
