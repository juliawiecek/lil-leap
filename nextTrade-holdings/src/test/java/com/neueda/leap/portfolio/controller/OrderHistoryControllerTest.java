package com.neueda.leap.portfolio.controller;

import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.portfolio.dto.OrderHistoryResponse;
import com.neueda.leap.portfolio.repository.OrderHistoryRepository;
import com.neueda.leap.portfolio.service.OrderHistoryService;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP behaviour of {@code GET /clients/{id}/orders} through the real JWT filter, method
 * security and history service (NEXT-117). Only the repository is mocked.
 */
@WebMvcTest(OrderHistoryController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class, OrderHistoryService.class})
class OrderHistoryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtServiceImpl jwtService;

    @MockBean
    private OrderHistoryRepository orderRepository;

    private final UUID userId = UUID.randomUUID();

    private String bearer(String role) {
        return "Bearer " + jwtService.issueToken(userId, "user@example.test", role);
    }

    @Test
    void callerGetsTheirOwnOrders() throws Exception {
        UUID orderId = UUID.randomUUID();
        when(orderRepository.findHistory(eq(userId), anyCollection(), any(), any())).thenReturn(List.of(
                new OrderHistoryResponse(orderId, "AAPL", "BUY", 1L, "FILLED", Instant.parse("2026-09-30T18:00:00Z"),
                        new BigDecimal("225.05"), 1L, Instant.parse("2026-09-30T18:00:02Z"))));

        mockMvc.perform(get("/clients/{id}/orders", userId).header("Authorization", bearer("TRADER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].orderId").value(orderId.toString()))
                .andExpect(jsonPath("$[0].status").value("FILLED"));
    }

    @Test
    void anotherClientsIdReturns404() throws Exception {
        mockMvc.perform(get("/clients/{id}/orders", UUID.randomUUID()).header("Authorization", bearer("TRADER")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("CLIENT_NOT_FOUND"));

        verifyNoInteractions(orderRepository);
    }

    @Test
    void malformedDateReturns400() throws Exception {
        mockMvc.perform(get("/clients/{id}/orders", userId).param("from", "30-09-2026")
                        .header("Authorization", bearer("TRADER")))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(orderRepository);
    }

    @Test
    void unknownStatusReturns400() throws Exception {
        mockMvc.perform(get("/clients/{id}/orders", userId).param("status", "SHIPPED")
                        .header("Authorization", bearer("TRADER")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_FILTER"));
    }

    @Test
    void analystIsForbidden() throws Exception {
        mockMvc.perform(get("/clients/{id}/orders", userId).header("Authorization", bearer("ANALYST")))
                .andExpect(status().isForbidden());

        verifyNoInteractions(orderRepository);
    }
}
