package com.neueda.leap.order.controller;

import com.neueda.leap.config.TestSecurityConfig;
import com.neueda.leap.order.repository.InstrumentRepository;
import com.neueda.leap.order.repository.OrderAccountRepository;
import com.neueda.leap.order.repository.OrderRepository;
import com.neueda.leap.order.repository.OrderStatusHistoryRepository;
import com.neueda.leap.order.service.OrderSubmissionService;
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
 * Test missing Authorization header returns 401 UNAUTHENTICATED.
 */
@WebMvcTest(OrderController.class)
@Import(TestSecurityConfig.class)
class OrderControllerMissingTokenTest {

    private final UUID accountId = UUID.randomUUID();
    private final UUID instrumentId = UUID.randomUUID();

    @Autowired
    private MockMvc mockMvc;

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

    private String body() {
        return """
                {"accountId":"%s","instrumentId":"%s","side":"BUY","quantity":1}
                """.formatted(accountId, instrumentId);
    }

    @Test
    void missingTokenReturnsUnauthenticated() throws Exception {
        mockMvc.perform(post("/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body()))
                .andExpect(status().isUnauthorized());
    }
}
