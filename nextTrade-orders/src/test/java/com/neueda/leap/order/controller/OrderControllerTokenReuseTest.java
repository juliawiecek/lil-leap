package com.neueda.leap.order.controller;

import com.neueda.leap.config.TestSecurityConfig;
import com.neueda.leap.order.dto.OrderSubmissionResponse;
import com.neueda.leap.order.repository.InstrumentRepository;
import com.neueda.leap.order.repository.OrderAccountRepository;
import com.neueda.leap.order.repository.OrderRepository;
import com.neueda.leap.order.repository.OrderStatusHistoryRepository;
import com.neueda.leap.order.service.OrderSubmissionService;
import com.neueda.leap.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Test same valid token works across multiple consecutive requests.
 */
@WebMvcTest(OrderController.class)
@Import(TestSecurityConfig.class)
class OrderControllerTokenReuseTest {

    private final UUID accountId = UUID.randomUUID();
    private final UUID instrumentId = UUID.randomUUID();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private OrderSubmissionService submissionService;

    @MockBean
    private OrderRepository orderRepository;

    @MockBean
    private OrderAccountRepository accountRepository;

    @MockBean
    private InstrumentRepository instrumentRepository;

    @MockBean
    private OrderStatusHistoryRepository statusHistoryRepository;

    private String bearer(UUID userId, String role) {
        return "Bearer " + jwtService.issueToken(userId, "user@example.test", role);
    }

    private String body() {
        return """
                {"accountId":"%s","instrumentId":"%s","side":"BUY","quantity":1}
                """.formatted(accountId, instrumentId);
    }

    @Test
    void tokenReuseAcrossMultipleRequests() throws Exception {
        UUID userId = UUID.randomUUID();
        String token = bearer(userId, "TRADER");
        OrderSubmissionResponse response = new OrderSubmissionResponse(UUID.randomUUID(), UUID.randomUUID(), "PENDING");
        
        when(submissionService.submit(any(UUID.class), any())).thenReturn(response);

        // First request
        mockMvc.perform(post("/orders")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body()))
                .andExpect(status().isCreated());

        // Second request - same token
        mockMvc.perform(post("/orders")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body()))
                .andExpect(status().isCreated());

        // Third request - same token
        mockMvc.perform(post("/orders")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"));
    }
}
