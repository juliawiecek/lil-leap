package com.neueda.leap.order.controller;

import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.order.model.Account;
import com.neueda.leap.order.model.Instrument;
import com.neueda.leap.order.model.Order;
import com.neueda.leap.order.repository.InstrumentRepository;
import com.neueda.leap.order.repository.OrderAccountRepository;
import com.neueda.leap.order.repository.OrderRepository;
import com.neueda.leap.order.repository.OrderStatusHistoryRepository;
import com.neueda.leap.order.service.OrderSubmissionService;
import com.neueda.leap.order.service.OrderValidationService;
import com.neueda.leap.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Role checks for {@code POST /orders} through the real JWT filter, method security
 * and submission service. Only the repositories are mocked.
 */
@WebMvcTest(OrderController.class)
@Import({SecurityConfig.class, JwtService.class, OrderSubmissionService.class, OrderValidationService.class})
class OrderControllerSecurityTest {

    private final UUID accountId = UUID.randomUUID();
    private final UUID instrumentId = UUID.randomUUID();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

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
        Account account = new Account();
        account.setAccountId(accountId);
        account.setUserId(userId);
        Instrument instrument = new Instrument();
        instrument.setInstrumentId(instrumentId);
        when(accountRepository.findByAccountIdAndUserId(accountId, userId)).thenReturn(Optional.of(account));
        when(instrumentRepository.findById(instrumentId)).thenReturn(Optional.of(instrument));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

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

        verifyNoInteractions(accountRepository, instrumentRepository, orderRepository, statusHistoryRepository);
    }
}
