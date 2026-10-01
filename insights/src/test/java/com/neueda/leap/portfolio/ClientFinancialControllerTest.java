package com.neueda.leap.portfolio;

import com.neueda.leap.portfolio.controller.ClientFinancialController;
import com.neueda.leap.portfolio.dto.CashBalanceDetailResponse;
import com.neueda.leap.portfolio.dto.HoldingResponse;
import com.neueda.leap.portfolio.dto.PortfolioSummaryResponse;
import com.neueda.leap.portfolio.service.ClientFinancialQueryService;
import com.neueda.leap.security.JwtPrincipal;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import org.junit.jupiter.api.AfterEach;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ClientFinancialController.class)
@AutoConfigureMockMvc(addFilters = false)
class ClientFinancialControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ClientFinancialQueryService queryService;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void holdingsUsesAuthenticatedPrincipalNotAClientRequestParameter() throws Exception {
        UUID userId = UUID.randomUUID();
        when(queryService.getHoldings(userId)).thenReturn(List.of());
        SecurityContextHolder.getContext().setAuthentication(authentication(userId));
        mockMvc.perform(get("/api/v1/holdings").principal(authentication(userId)))
                .andExpect(status().isOk());
        verify(queryService).getHoldings(userId);
    }

    @Test
    void anotherClientsHoldingsAreDeniedBeforeQuerying() throws Exception {
        UUID userId = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(authentication(userId));
        mockMvc.perform(get("/api/v1/clients/{id}/holdings", UUID.randomUUID())
                        .principal(authentication(userId)))
                .andExpect(status().isForbidden());
        verifyNoInteractions(queryService);
    }

    @Test
    void cashUsesAuthenticatedPrincipalNotAClientRequestParameter() throws Exception {
        UUID userId = UUID.randomUUID();
        when(queryService.getCashBalances(userId)).thenReturn(List.of());
        SecurityContextHolder.getContext().setAuthentication(authentication(userId));
        mockMvc.perform(get("/api/v1/cash").principal(authentication(userId)))
                .andExpect(status().isOk());
        verify(queryService).getCashBalances(userId);
    }

    @Test
    void ordersUsesAuthenticatedPrincipalNotAClientRequestParameter() throws Exception {
        UUID userId = UUID.randomUUID();
        when(queryService.getOrders(userId)).thenReturn(List.of());
        SecurityContextHolder.getContext().setAuthentication(authentication(userId));
        mockMvc.perform(get("/api/v1/orders").principal(authentication(userId)))
                .andExpect(status().isOk());
        verify(queryService).getOrders(userId);
    }

    @Test
    void portfolioSummaryReturnsSuccessfullyForAuthenticatedUser() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID accountId = UUID.randomUUID();
        UUID instrumentId = UUID.randomUUID();
        
        HoldingResponse holding = new HoldingResponse(
                accountId, instrumentId, "AAPL", "Apple Inc",
                10, new BigDecimal("150.00"), Instant.now());
        
        CashBalanceDetailResponse cash = new CashBalanceDetailResponse(
                accountId, "USD",
                new BigDecimal("5000.00"),
                new BigDecimal("1000.00"),
                new BigDecimal("4000.00"),
                new BigDecimal("6000.00"),
                Instant.now());
        
        PortfolioSummaryResponse summary = new PortfolioSummaryResponse(
                accountId,
                List.of(holding),
                cash,
                new BigDecimal("5500.00"),
                Instant.now());
        
        when(queryService.getPortfolioSummary(userId, accountId)).thenReturn(summary);
        when(queryService.getHoldings(userId)).thenReturn(List.of(holding));
        
        SecurityContextHolder.getContext().setAuthentication(authentication(userId));
        mockMvc.perform(get("/api/v1/clients/{clientId}/portfolio-summary", userId)
                        .principal(authentication(userId)))
                .andExpect(status().isOk());
        verify(queryService).getPortfolioSummary(userId, accountId);
    }

    @Test
    void portfolioSummaryDeniesAccessToOtherUsersAccounts() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID otherUserId = UUID.randomUUID();
        
        SecurityContextHolder.getContext().setAuthentication(authentication(userId));
        mockMvc.perform(get("/api/v1/clients/{clientId}/portfolio-summary", otherUserId)
                        .principal(authentication(userId)))
                .andExpect(status().isForbidden());
        verifyNoInteractions(queryService);
    }

    @Test
    void portfolioSummaryReturnsNotFoundWhenNoAccountsExist() throws Exception {
        UUID userId = UUID.randomUUID();
        
        when(queryService.getHoldings(userId)).thenReturn(List.of());
        when(queryService.getCashBalances(userId)).thenReturn(List.of());
        
        SecurityContextHolder.getContext().setAuthentication(authentication(userId));
        mockMvc.perform(get("/clients/{clientId}/portfolio-summary", userId)
                        .principal(authentication(userId)))
                .andExpect(status().isNotFound());
    }

    private static UsernamePasswordAuthenticationToken authentication(UUID userId) {
        return new UsernamePasswordAuthenticationToken(
                new JwtPrincipal(userId, "synthetic.user@example.test", "TRADER"),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_TRADER")));
    }
}
