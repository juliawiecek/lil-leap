package com.neueda.leap.order.submission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.order.service.OrderSufficiencyException;
import com.neueda.leap.order.submission.controller.OrderSubmissionController;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.service.OrderSubmissionService;
import com.neueda.leap.security.JwtService;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(OrderSubmissionController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class})
class OrderSubmissionControllerTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtService tokens;
    @MockBean OrderSubmissionService service;
    private final UUID user = UUID.randomUUID();

    @ParameterizedTest
    @EnumSource(OrderSufficiencyException.Reason.class)
    void authenticatedSubmissionReturnsSafeRuleRejection(OrderSufficiencyException.Reason reason) throws Exception {
        var request = request();
        var rejection = new OrderSufficiencyException(reason);
        when(service.submit(user, request)).thenThrow(rejection);

        mvc.perform(post("/orders").header("Authorization", "Bearer " + tokens.issueToken(user, "test@example.test"))
                        .contentType("application/json").content(json.writeValueAsBytes(request)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(content().json(json.writeValueAsString(java.util.Map.of(
                        "error", reason.name(), "message", rejection.getMessage())), true));
        verify(service).submit(user, request);
    }

    @Test
    void missingAuthenticationCannotSubmit() throws Exception {
        mvc.perform(post("/orders").contentType("application/json").content(json.writeValueAsBytes(request())))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void queryScopeCannotOverrideAuthenticatedIdentity() throws Exception {
        mvc.perform(post("/orders").header("Authorization", "Bearer " + tokens.issueToken(user, "test@example.test"))
                        .param("userId", UUID.randomUUID().toString())
                        .contentType("application/json").content(json.writeValueAsBytes(request())))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    private SubmitOrderRequest request() {
        return new SubmitOrderRequest(UUID.randomUUID(), "AAPL", UUID.randomUUID(), "BUY", 10, "MARKET", null);
    }
}
