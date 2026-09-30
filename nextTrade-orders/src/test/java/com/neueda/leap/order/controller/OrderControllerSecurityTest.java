package com.neueda.leap.order.controller;

import com.neueda.leap.config.SecurityConfig;
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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Role checks for {@code POST /orders} through the real JWT filter and method security.
 * Services and repositories are mocked to isolate the authentication/authorization layer.
 */
@WebMvcTest(OrderController.class)
@Import({SecurityConfig.class, JwtService.class})
class OrderControllerSecurityTest {

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
    void traderCanSubmitOrder() throws Exception {
        UUID userId = UUID.randomUUID();
        OrderSubmissionResponse response = new OrderSubmissionResponse(UUID.randomUUID(), UUID.randomUUID(), "PENDING");
        
        when(submissionService.submit(any(UUID.class), any())).thenReturn(response);

        mockMvc.perform(post("/orders")
                        .header("Authorization", bearer(userId, "TRADER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    void analystIsForbiddenAndNoOrderIsSubmitted() throws Exception {
        mockMvc.perform(post("/orders")
                        .header("Authorization", bearer(UUID.randomUUID(), "ANALYST"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("FORBIDDEN"));

        verifyNoInteractions(submissionService, accountRepository, instrumentRepository, orderRepository, statusHistoryRepository);
    }

    @Test
    void missingTokenReturns401Unauthenticated() throws Exception {
        mockMvc.perform(post("/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("UNAUTHENTICATED"));

        verifyNoInteractions(submissionService, accountRepository, instrumentRepository, orderRepository, statusHistoryRepository);
    }

    @Test
    void invalidTokenReturns401InvalidToken() throws Exception {
        mockMvc.perform(post("/orders")
                        .header("Authorization", "Bearer invalid.token.signature")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("INVALID_TOKEN"));

        verifyNoInteractions(submissionService, accountRepository, instrumentRepository, orderRepository, statusHistoryRepository);
    }

    @Test
    void sameValidTokenWorksRepeatedly() throws Exception {
        UUID userId = UUID.randomUUID();
        OrderSubmissionResponse response = new OrderSubmissionResponse(UUID.randomUUID(), UUID.randomUUID(), "PENDING");
        
        when(submissionService.submit(any(UUID.class), any())).thenReturn(response);

        String token = "Bearer " + jwtService.issueToken(userId, "user@example.test", "TRADER");
        String request = body();

        // Request 1 with same token
        mockMvc.perform(post("/orders")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isCreated());

        // Request 2 with SAME token - should also succeed
        mockMvc.perform(post("/orders")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isCreated());

        // Request 3 with SAME token - should also succeed
        mockMvc.perform(post("/orders")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isCreated());
    }

    @Test
    void malformedDtoWithValidTokenReturns400() throws Exception {
        UUID userId = UUID.randomUUID();
        mockMvc.perform(post("/orders")
                        .header("Authorization", bearer(userId, "TRADER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"side\":\"BUY\",\"quantity\":1}"))  // Missing accountId and instrumentId
                .andExpect(status().isBadRequest());

        verifyNoInteractions(submissionService, accountRepository, instrumentRepository, orderRepository, statusHistoryRepository);
    }
}
