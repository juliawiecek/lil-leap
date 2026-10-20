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

import java.math.BigDecimal;
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
    @MockBean TradeLookup trades;

    private final UUID orderId = UUID.randomUUID();
    private final UUID accountId = UUID.randomUUID();

    @Test
    void onlyOperationsStaffCanReadATrade() throws Exception {
        mvc.perform(get("/trades/{id}", orderId)).andExpect(status().isUnauthorized());
        mvc.perform(asRole("ANALYST", get("/trades/{id}", orderId))).andExpect(status().isForbidden());
        mvc.perform(asRole("TRADER", get("/trades/{id}", orderId))).andExpect(status().isForbidden());
        verifyNoInteractions(trades);
    }

    @Test
    void returnsTheFillTheClientBehindItAndEveryStep() throws Exception {
        when(trades.find(orderId)).thenReturn(Optional.of(new TradeRecord(orderId, Instant.parse("2026-10-14T14:30:02Z"),
                "AAPL", "Apple Inc.", "BUY", 2, new BigDecimal("225.10"), new BigDecimal("450.20"),
                new TradeRecord.Account(accountId, "NT-DEMO-0001", "Maya Chen Individual", "Maya Chen",
                        "maya.chen@demo.nexttrade.local", "NOVICE", "ACTIVE"),
                List.of(new TradeRecord.Event("STATUS", "SUBMITTED", null, Instant.parse("2026-10-14T14:30:00Z"),
                                Map.of("reasonCode", "SUBMISSION_VALIDATED")),
                        new TradeRecord.Event("AUDIT", "ORDER_FILLED", "SYSTEM", Instant.parse("2026-10-14T14:30:02Z"),
                                Map.of("quantity", 2))))));

        mvc.perform(asRole("OPERATIONS", get("/trades/{id}", orderId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value(orderId.toString()))
                .andExpect(jsonPath("$.filledAt").value("2026-10-14T14:30:02Z"))
                .andExpect(jsonPath("$.symbol").value("AAPL"))
                .andExpect(jsonPath("$.value").value(450.20))
                .andExpect(jsonPath("$.account.accountId").value(accountId.toString()))
                .andExpect(jsonPath("$.account.clientName").value("Maya Chen"))
                .andExpect(jsonPath("$.account.email").value("maya.chen@demo.nexttrade.local"))
                .andExpect(jsonPath("$.events.length()").value(2))
                .andExpect(jsonPath("$.events[0].occurredAt").value("2026-10-14T14:30:00Z"))
                .andExpect(jsonPath("$.events[0].details.reasonCode").value("SUBMISSION_VALIDATED"))
                .andExpect(jsonPath("$.events[1].actor").value("SYSTEM"));
    }

    @Test
    void anUnknownTradeIsNotFoundAndABadIdIsRejected() throws Exception {
        when(trades.find(orderId)).thenReturn(Optional.empty());

        mvc.perform(asRole("OPERATIONS", get("/trades/{id}", orderId))).andExpect(status().isNotFound());
        mvc.perform(asRole("OPERATIONS", get("/trades/not-an-id"))).andExpect(status().isBadRequest());
    }

    private MockHttpServletRequestBuilder asRole(String role, MockHttpServletRequestBuilder request) {
        String token = jwtService.issueToken(UUID.randomUUID(), "synthetic.user@example.test", role);
        return request.header("Authorization", "Bearer " + token);
    }
}
