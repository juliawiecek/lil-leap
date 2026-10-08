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
    @Autowired JwtServiceImpl tokens;
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

    @Test
    void analystCannotSubmitThroughTheCanonicalController() throws Exception {
        mvc.perform(post("/orders").header("Authorization", "Bearer " + tokens.issueToken(user, "analyst@example.test", "ANALYST"))
                        .contentType("application/json").content(json.writeValueAsBytes(request())))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void cashMovementsHaveNoExternalRoute() throws Exception {
        String bearer = "Bearer " + tokens.issueToken(user, "test@example.test", "TRADER");
        for (String path : new String[]{"/cash/buy", "/cash/sell"}) {
            mvc.perform(post(path).header("Authorization", bearer)
                            .contentType("application/json").content("{\"amount\":100}"))
                    .andExpect(status().isForbidden());
        }
        verifyNoInteractions(service);
    }

    @Test
    void invalidTokenCannotSubmit() throws Exception {
        mvc.perform(post("/orders").header("Authorization", "Bearer invalid-token")
                        .contentType("application/json").content(json.writeValueAsBytes(request())))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void malformedSubmissionDoesNotReachService() throws Exception {
        var invalid = new SubmitOrderRequest(UUID.randomUUID(), "AAPL", UUID.randomUUID(),
                "BUY", 0, "MARKET", null);
        mvc.perform(post("/orders").header("Authorization", "Bearer " + tokens.issueToken(user, "test@example.test"))
                        .contentType("application/json").content(json.writeValueAsBytes(invalid)))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void traderCanReuseTokenForNewOrdersAndIdempotentRetries() throws Exception {
        String bearer = "Bearer " + tokens.issueToken(user, "test@example.test", "TRADER");
        var request = request();
        var order = new com.neueda.leap.order.submission.dto.OrderSubmissionResponse(
                UUID.randomUUID(), request.accountId(), UUID.randomUUID(), "AAPL", request.clientReference(),
                "BUY", 10, "MARKET", "SUBMITTED", java.time.Instant.now(), null);
        when(service.submit(user, request)).thenReturn(
                new com.neueda.leap.order.submission.service.OrderSubmissionResult(order, true),
                new com.neueda.leap.order.submission.service.OrderSubmissionResult(order, false));

        for (int expectedStatus : new int[]{201, 200, 200}) {
            mvc.perform(post("/orders").header("Authorization", bearer)
                            .contentType("application/json").content(json.writeValueAsBytes(request)))
                    .andExpect(status().is(expectedStatus))
                    .andExpect(jsonPath("$.orderId").value(order.orderId().toString()))
                    .andExpect(jsonPath("$.status").value("SUBMITTED"));
        }
        verify(service, times(3)).submit(user, request);
    }
}
