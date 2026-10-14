package com.neueda.leap.portfolio.controller;

import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.portfolio.dto.AccountResponse;
import com.neueda.leap.portfolio.dto.TransferRequest;
import com.neueda.leap.portfolio.dto.TransferResponse;
import com.neueda.leap.portfolio.service.AccountActionException;
import com.neueda.leap.portfolio.service.AccountActionException.Reason;
import com.neueda.leap.portfolio.service.AccountService;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** HTTP contract of the account endpoints through the real JWT filter and security rules (PS-05). */
@WebMvcTest(AccountController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class})
class AccountControllerTest {

    @Autowired private MockMvc mvc;
    @Autowired private JwtServiceImpl jwt;
    @MockBean private AccountService accounts;

    private final UUID userId = UUID.randomUUID();
    private final UUID from = UUID.randomUUID();
    private final UUID to = UUID.randomUUID();

    private String bearer(String role) {
        return "Bearer " + jwt.issueToken(userId, "user@example.test", role);
    }

    @Test
    void listsOnlyTheCallersAccounts() throws Exception {
        when(accounts.list(userId)).thenReturn(List.of(Map.of("account_id", from, "account_name", "Brokerage")));
        mvc.perform(get("/accounts").header("Authorization", bearer("TRADER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].account_name").value("Brokerage"));
    }

    @Test
    void opensAnAccountWithoutACsrfTokenBecauseTheBearerHeaderAuthenticates() throws Exception {
        when(accounts.open(userId, "Long-term investing")).thenReturn(new AccountResponse(from, "NT0123456789AB",
                "Long-term investing", "INDIVIDUAL_CASH", "USD", "ACTIVE", true, BigDecimal.ZERO, Instant.EPOCH));
        mvc.perform(post("/accounts").header("Authorization", bearer("TRADER"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":\"Long-term investing\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accountId").value(from.toString()))
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"nickname\":\"   \"}", "{\"nickname\":\"<script>\"}",
            "{\"nickname\":\"This nickname is far too long to fit in the account picker!!\"}"})
    void rejectsAMissingOrUnsafeNickname(String body) throws Exception {
        mvc.perform(post("/accounts").header("Authorization", bearer("TRADER"))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_REQUEST"));
        verifyNoInteractions(accounts);
    }

    @Test
    void transfersBetweenTheCallersAccounts() throws Exception {
        when(accounts.transfer(eq(userId), any(TransferRequest.class))).thenReturn(new TransferResponse(UUID.randomUUID(),
                from, to, new BigDecimal("25.00"), new BigDecimal("75.00"), new BigDecimal("25.00"), Instant.EPOCH));
        mvc.perform(post("/accounts/transfers").header("Authorization", bearer("TRADER"))
                        .contentType(MediaType.APPLICATION_JSON).content(transfer("25.00")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fromBalance").value(75.0));
        verify(accounts).transfer(userId, new TransferRequest(from, to, new BigDecimal("25.00")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-5", "0.001", "\"abc\"", "1000000000.01"})
    void rejectsAnAmountThatIsNotAPositiveCentValue(String amount) throws Exception {
        mvc.perform(post("/accounts/transfers").header("Authorization", bearer("TRADER"))
                        .contentType(MediaType.APPLICATION_JSON).content(transfer(amount)))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(accounts);
    }

    @Test
    void reportsARejectedTransferWithItsFixedCodeAndMessage() throws Exception {
        when(accounts.transfer(eq(userId), any(TransferRequest.class)))
                .thenThrow(new AccountActionException(Reason.ACCOUNT_ACCESS_DENIED));
        mvc.perform(post("/accounts/transfers").header("Authorization", bearer("TRADER"))
                        .contentType(MediaType.APPLICATION_JSON).content(transfer("10")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("ACCOUNT_ACCESS_DENIED"))
                .andExpect(jsonPath("$.message").value("You can only use your own accounts."));
    }

    @Test
    void analystsAndAnonymousCallersCannotMoveCash() throws Exception {
        mvc.perform(post("/accounts/transfers").header("Authorization", bearer("ANALYST"))
                        .contentType(MediaType.APPLICATION_JSON).content(transfer("10")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/accounts").contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":\"x\"}"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(accounts);
    }

    private String transfer(String amount) {
        return "{\"fromAccountId\":\"%s\",\"toAccountId\":\"%s\",\"amount\":%s}".formatted(from, to, amount);
    }
}
