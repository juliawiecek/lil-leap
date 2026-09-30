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

    private void assertQueryUsesOwnershipJoinAndUserId(UUID userId) {
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), eq(userId));
        String normalized = sql.getValue().replaceAll("\\s+", " ").toLowerCase();
        assertTrue(normalized.contains("join accounts a"));
        assertTrue(normalized.contains("where a.user_id = ?"));
    }
}
