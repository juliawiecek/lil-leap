package com.neueda.leap.portfolio;

import com.neueda.leap.portfolio.service.ClientFinancialQueryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ClientFinancialQueryServiceTest {

    private JdbcTemplate jdbcTemplate;
    private ClientFinancialQueryService service;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        service = new ClientFinancialQueryService(jdbcTemplate);
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object.class)))
                .thenReturn(List.of());
    }

    @Test
    void holdingsQueryMustScopeThroughAuthenticatedUserId() {
        UUID userId = UUID.randomUUID();
        service.getHoldings(userId);
        assertQueryUsesOwnershipJoinAndUserId(userId);
    }

    @Test
    void cashQueryMustScopeThroughAuthenticatedUserId() {
        UUID userId = UUID.randomUUID();
        service.getCashBalances(userId);
        assertQueryUsesOwnershipJoinAndUserId(userId);
    }

    @Test
    void ordersQueryMustScopeThroughAuthenticatedUserId() {
        UUID userId = UUID.randomUUID();
        service.getOrders(userId);
        assertQueryUsesOwnershipJoinAndUserId(userId);
    }

    @Test
    void nullAuthenticatedIdentityIsRejectedBeforeQuery() {
        assertThrows(IllegalArgumentException.class, () -> service.getOrders(null));
    }

    @Test
    void cashDetailedQueryMustScopeThroughAuthenticatedUserId() {
        UUID userId = UUID.randomUUID();
        service.getCashBalancesDetailed(userId);
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), eq(userId));
        String normalized = sql.getValue().replaceAll("\\s+", " ").toLowerCase();
        assertTrue(normalized.contains("accounts"));
        assertTrue(normalized.contains("user_id"));
    }

    @Test
    void portfolioSummaryQueryRequiresAuthenticatedUserAndAccountId() {
        UUID userId = UUID.randomUUID();
        UUID accountId = UUID.randomUUID();
        // The service will make multiple queries internally
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.getPortfolioSummary(userId, accountId));
        // Verify that query was called at least once
        verify(jdbcTemplate, atLeastOnce()).query(anyString(), any(RowMapper.class), any(), any());
    }

    @Test
    void portfolioSummaryRejectsNullAuthenticatedUser() {
        UUID accountId = UUID.randomUUID();
        assertThrows(IllegalArgumentException.class, () -> service.getPortfolioSummary(null, accountId));
    }

    @Test
    void portfolioSummaryRejectsNullAccountId() {
        UUID userId = UUID.randomUUID();
        assertThrows(IllegalArgumentException.class, () -> service.getPortfolioSummary(userId, null));
    }

    private void assertQueryUsesOwnershipJoinAndUserId(UUID userId) {
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), eq(userId));
        String normalized = sql.getValue().replaceAll("\\s+", " ").toLowerCase();
        assertTrue(normalized.contains("join accounts a"));
        assertTrue(normalized.contains("where a.user_id = ?"));
    }
}
