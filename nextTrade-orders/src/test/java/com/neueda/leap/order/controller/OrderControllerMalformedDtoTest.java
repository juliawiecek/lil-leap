package com.neueda.leap.order.controller;

import com.neueda.leap.config.TestSecurityConfig;
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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Test malformed DTO returns 400 Bad Request.
 */
@WebMvcTest(OrderController.class)
@Import(TestSecurityConfig.class)
class OrderControllerMalformedDtoTest {

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

    @Test
    void malformedDtoReturnsBadRequest() throws Exception {
        UUID userId = UUID.randomUUID();
        String malformedBody = "{\"invalid\": \"json\"}";

        mockMvc.perform(post("/orders")
                        .header("Authorization", bearer(userId, "TRADER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(malformedBody))
                .andExpect(status().isBadRequest());
    }
}
