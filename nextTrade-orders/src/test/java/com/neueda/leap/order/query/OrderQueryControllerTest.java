package com.neueda.leap.order.query;

import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(OrderQueryController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class})
class OrderQueryControllerTest {
    @Autowired MockMvc mvc;
    @Autowired JwtServiceImpl tokens;
    @MockBean OrderQueryService service;
    private final UUID user = UUID.randomUUID();
    private final UUID order = UUID.randomUUID();

    private String trader() {
        return "Bearer " + tokens.issueToken(user, "test@example.test", "TRADER");
    }

    @Test
    void traderReadsOwnOrderDetail() throws Exception {
        Instant now = Instant.parse("2026-10-08T12:00:00Z");
        when(service.getDetail(order, user)).thenReturn(new OrderDetailResponse(order, UUID.randomUUID(),
                UUID.randomUUID(), "AAPL", UUID.randomUUID(), "BUY", 10, "MARKET", "FILLED", now, now, now,
                null, 10L, new BigDecimal("100.00000000"), now));

        mvc.perform(get("/orders/{id}", order).header("Authorization", trader()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value(order.toString()))
                .andExpect(jsonPath("$.status").value("FILLED"))
                .andExpect(jsonPath("$.filledQuantity").value(10))
                .andExpect(jsonPath("$.executionPrice").value(100.0));
        verify(service).getDetail(order, user);
    }

    @Test
    void traderReadsOwnOrderStatusWithLatestReason() throws Exception {
        when(service.getStatus(order, user)).thenReturn(new OrderStatusResponse(order, "REJECTED",
                "QUOTE_STALE", null, Instant.parse("2026-10-08T12:00:00Z")));

        mvc.perform(get("/orders/{id}/status", order).header("Authorization", trader()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.reasonCode").value("QUOTE_STALE"));
        verify(service).getStatus(order, user);
    }

    @Test
    void unknownOrOtherClientsOrderIsNotFound() throws Exception {
        when(service.getDetail(order, user)).thenThrow(new OrderNotFoundException());
        when(service.getStatus(order, user)).thenThrow(new OrderNotFoundException());

        for (String path : new String[]{"/orders/{id}", "/orders/{id}/status"}) {
            mvc.perform(get(path, order).header("Authorization", trader()))
                    .andExpect(status().isNotFound())
                    .andExpect(content().json("{\"error\":\"ORDER_NOT_FOUND\",\"message\":\"The order was not found.\"}", true));
        }
    }

    @Test
    void missingAuthenticationCannotRead() throws Exception {
        mvc.perform(get("/orders/{id}", order)).andExpect(status().isUnauthorized());
        mvc.perform(get("/orders/{id}/status", order)).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void analystCannotRead() throws Exception {
        String analyst = "Bearer " + tokens.issueToken(user, "analyst@example.test", "ANALYST");
        mvc.perform(get("/orders/{id}", order).header("Authorization", analyst)).andExpect(status().isForbidden());
        mvc.perform(get("/orders/{id}/status", order).header("Authorization", analyst)).andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void nonUuidPathsAndQueryStringsStayDenied() throws Exception {
        mvc.perform(get("/orders/quote-preview").param("symbol", "AAPL").header("Authorization", trader()))
                .andExpect(status().isForbidden());
        mvc.perform(get("/orders/not-a-uuid").header("Authorization", trader()))
                .andExpect(status().isForbidden());
        mvc.perform(get("/orders/{id}", order).param("userId", UUID.randomUUID().toString())
                        .header("Authorization", trader()))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }
}
