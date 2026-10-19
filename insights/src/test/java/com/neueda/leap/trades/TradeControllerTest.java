package com.neueda.leap.trades;

import com.neueda.leap.common.exception.GlobalExceptionHandler;
import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(TradeController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class, GlobalExceptionHandler.class})
class TradeControllerTest {

    @Autowired MockMvc mvc;
    @Autowired JwtServiceImpl jwtService;
    @MockBean TradeTrailRepository trails;

    private final UUID orderId = UUID.randomUUID();

    @Test
    void onlyOperationsStaffCanReadATrade() throws Exception {
        mvc.perform(get("/trades/{id}/events", orderId)).andExpect(status().isUnauthorized());
        mvc.perform(asRole("ANALYST", get("/trades/{id}/events", orderId))).andExpect(status().isForbidden());
        mvc.perform(asRole("TRADER", get("/trades/{id}/events", orderId))).andExpect(status().isForbidden());
        verifyNoInteractions(trails);
    }

    @Test
    void returnsTheTradesEventsOldestFirst() throws Exception {
        Instant submitted = Instant.parse("2026-10-14T14:30:00Z");
        when(trails.trail(orderId)).thenReturn(Optional.of(List.of(
                new TradeEvent("STATUS", "SUBMITTED", null, submitted, Map.of()),
                new TradeEvent("AUDIT", "ORDER_ACCEPTED", "SYSTEM", submitted.plusSeconds(1), Map.of("payload", "{}")),
                new TradeEvent("FILL", "FILLED", null, submitted.plusSeconds(2), Map.of("quantity", 2, "price", "225.1")))));

        mvc.perform(asRole("OPERATIONS", get("/trades/{id}/events", orderId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value(orderId.toString()))
                .andExpect(jsonPath("$.auditRecorded").value(true))
                .andExpect(jsonPath("$.events.length()").value(3))
                .andExpect(jsonPath("$.events[0].type").value("SUBMITTED"))
                .andExpect(jsonPath("$.events[1].actor").value("SYSTEM"))
                .andExpect(jsonPath("$.events[2].details.price").value("225.1"))
                .andExpect(jsonPath("$.events[0].occurredAt").value("2026-10-14T14:30:00Z"));
    }

    @Test
    void aTradeWithNoAuditRowsIsMarkedIncomplete() throws Exception {
        when(trails.trail(orderId)).thenReturn(Optional.of(List.of(
                new TradeEvent("STATUS", "SUBMITTED", null, Instant.now(), Map.of()))));

        mvc.perform(asRole("OPERATIONS", get("/trades/{id}/events", orderId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.auditRecorded").value(false));
    }

    @Test
    void anUnknownTradeIsNotFound() throws Exception {
        when(trails.trail(orderId)).thenReturn(Optional.empty());

        mvc.perform(asRole("OPERATIONS", get("/trades/{id}/events", orderId)))
                .andExpect(status().isNotFound());
    }

    private MockHttpServletRequestBuilder asRole(String role, MockHttpServletRequestBuilder request) {
        String token = jwtService.issueToken(UUID.randomUUID(), "synthetic.user@example.test", role);
        return request.header("Authorization", "Bearer " + token);
    }
}
