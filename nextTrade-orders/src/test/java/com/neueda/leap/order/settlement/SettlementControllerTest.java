package com.neueda.leap.order.settlement;

import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** POST /settlements/recover and /rollback through the real security chain (TS-10.3). */
@WebMvcTest(SettlementController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class})
class SettlementControllerTest {
    @org.springframework.boot.test.mock.mockito.MockBean
    private com.neueda.leap.security.AuthSessionClient activeSessions;

    @org.junit.jupiter.api.BeforeEach
    void allowTestSessions() {
        org.mockito.Mockito.when(activeSessions.test(org.mockito.ArgumentMatchers.anyString())).thenReturn(true);
    }

    private static final String RECOVER = "/settlements/recover";
    private static final String ROLLBACK = "/settlements/rollback";
        private static final String STATUS = "/settlements/status/";
    private static final String AUTHORIZATION = "Authorization";
    private static final String SETTLEMENT_ID = "settlementId";

    @Autowired MockMvc mvc;
    @Autowired JwtServiceImpl tokens;
    @MockBean SettlementRecoveryService settlements;

    private final UUID fill = UUID.randomUUID();

    @Test
    void operationsCanRecoverASettlement() throws Exception {
        when(settlements.recover(fill)).thenReturn(
                new SettlementResult(fill, "RECOVERED", List.of(SettlementPart.CASH_TRANSACTION)));

        mvc.perform(post(RECOVER).header(AUTHORIZATION, bearer("OPERATIONS")).param(SETTLEMENT_ID, fill.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settlementId").value(fill.toString()))
                .andExpect(jsonPath("$.action").value("RECOVERED"))
                .andExpect(jsonPath("$.repaired[0]").value("CASH_TRANSACTION"));
    }

    @Test
    void operationsCanRollBackASettlement() throws Exception {
        when(settlements.rollback(fill)).thenReturn(new SettlementResult(fill, "ROLLED_BACK", List.of()));

        mvc.perform(post(ROLLBACK).header(AUTHORIZATION, bearer("OPERATIONS")).param(SETTLEMENT_ID, fill.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.action").value("ROLLED_BACK"));
    }

    @Test
    void operationsCanReadSettlementStatus() throws Exception {
        when(settlements.status(fill)).thenReturn(new SettlementStatusResponse(fill, "SETTLED", UUID.randomUUID()));

        mvc.perform(get(STATUS + fill).header(AUTHORIZATION, bearer("OPERATIONS")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tradeId").value(fill.toString()))
                .andExpect(jsonPath("$.status").value("SETTLED"));
    }

    @Test
    void tradersCannotReadSettlementStatus() throws Exception {
        mvc.perform(get(STATUS + fill).header(AUTHORIZATION, bearer("TRADER")))
                .andExpect(status().isForbidden());
        verifyNoInteractions(settlements);
    }

    @Test
    void unknownTradeStatusIsNotFound() throws Exception {
        when(settlements.status(fill)).thenThrow(new SettlementException(HttpStatus.NOT_FOUND,
                "TRADE_NOT_FOUND", "No trade exists with this tradeId."));

        mvc.perform(get(STATUS + fill).header(AUTHORIZATION, bearer("OPERATIONS")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("TRADE_NOT_FOUND"));
    }

    @Test
    void tradersAndAnonymousCallersAreRefused() throws Exception {
        mvc.perform(post(RECOVER).header(AUTHORIZATION, bearer("TRADER")).param(SETTLEMENT_ID, fill.toString()))
                .andExpect(status().isForbidden());
        mvc.perform(post(ROLLBACK).param(SETTLEMENT_ID, fill.toString()))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(settlements);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "not-a-uuid", "------------------------------------"})
    void malformedSettlementIdIsABadRequest(String settlementId) throws Exception {
        mvc.perform(post(RECOVER).header(AUTHORIZATION, bearer("OPERATIONS")).param(SETTLEMENT_ID, settlementId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_REQUEST"));
        verifyNoInteractions(settlements);
    }

    @Test
    void serviceFailuresKeepTheirStatusAndCode() throws Exception {
        when(settlements.rollback(fill)).thenThrow(new SettlementException(HttpStatus.CONFLICT,
                "SETTLEMENT_APPLIED", "This settlement already changed balances."));

        mvc.perform(post(ROLLBACK).header(AUTHORIZATION, bearer("OPERATIONS")).param(SETTLEMENT_ID, fill.toString()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("SETTLEMENT_APPLIED"));
    }

    private String bearer(String role) {
        return "Bearer " + tokens.issueToken(UUID.randomUUID(), "ops@example.test", role);
    }
}
