package com.neueda.leap.portfolio;

import com.neueda.leap.portfolio.controller.ClientFinancialController;
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

import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.verify;
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
        mockMvc.perform(get("/holdings").principal(authentication(userId)))
                .andExpect(status().isOk());
        verify(queryService).getHoldings(userId);
    }

    @Test
    void cashUsesAuthenticatedPrincipalNotAClientRequestParameter() throws Exception {
        UUID userId = UUID.randomUUID();
        when(queryService.getCashBalances(userId)).thenReturn(List.of());
        SecurityContextHolder.getContext().setAuthentication(authentication(userId));
        mockMvc.perform(get("/cash").principal(authentication(userId)))
                .andExpect(status().isOk());
        verify(queryService).getCashBalances(userId);
    }

    @Test
    void ordersUsesAuthenticatedPrincipalNotAClientRequestParameter() throws Exception {
        UUID userId = UUID.randomUUID();
        when(queryService.getOrders(userId)).thenReturn(List.of());
        SecurityContextHolder.getContext().setAuthentication(authentication(userId));
        mockMvc.perform(get("/orders").principal(authentication(userId)))
                .andExpect(status().isOk());
        verify(queryService).getOrders(userId);
    }

    private static UsernamePasswordAuthenticationToken authentication(UUID userId) {
        return new UsernamePasswordAuthenticationToken(
                new JwtPrincipal(userId, "synthetic.user@example.test", "TRADER"),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_TRADER")));
    }
}
