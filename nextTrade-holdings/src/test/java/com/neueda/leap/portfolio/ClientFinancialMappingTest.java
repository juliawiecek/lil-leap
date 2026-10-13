package com.neueda.leap.portfolio;

import com.neueda.leap.portfolio.service.ClientFinancialQueryService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ClientFinancialMappingTest {
    private final UUID user = UUID.randomUUID(), account = UUID.randomUUID(), instrument = UUID.randomUUID();
    private final UUID order = UUID.randomUUID(), reference = UUID.randomUUID();
    private final Instant now = Instant.parse("2026-10-01T12:00:00Z");
    private boolean missingAccount, missingQuote, accepted;
    private long quantity = 2;
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class, invocation -> {
        Object[] args = invocation.getArguments();
        if (args.length < 2 || !(args[1] instanceof RowMapper<?> mapper)) return RETURNS_DEFAULTS.answer(invocation);
        String sql = (String) args[0];
        if (sql.contains("user_id = ?")) assertThat(args[2]).isEqualTo(user);
        if (args.length == 4) assertThat(args[3]).isEqualTo(account);
        if (sql.contains("FROM quotes") && missingQuote) return List.of();
        if (sql.contains("FROM accounts") && missingAccount) return List.of();
        ResultSet rs = mock(ResultSet.class);
        when(rs.getObject(1, UUID.class)).thenReturn(account);
        when(rs.getObject("account_id", UUID.class)).thenReturn(account);
        when(rs.getObject("instrument_id", UUID.class)).thenReturn(instrument);
        when(rs.getObject("order_id", UUID.class)).thenReturn(order);
        when(rs.getObject("client_reference", UUID.class)).thenReturn(reference);
        when(rs.getString("symbol")).thenReturn("AAPL");
        when(rs.getString("instrument_name")).thenReturn("Apple");
        when(rs.getString("currency")).thenReturn("USD");
        when(rs.getString("side")).thenReturn("BUY");
        when(rs.getString("order_type")).thenReturn("MARKET");
        when(rs.getString("status")).thenReturn("SUBMITTED");
        when(rs.getLong("quantity")).thenReturn(quantity);
        when(rs.getBigDecimal("avg_cost")).thenReturn(new BigDecimal("90"));
        when(rs.getBigDecimal("midpoint")).thenReturn(new BigDecimal("100"));
        when(rs.getBigDecimal("balance")).thenReturn(new BigDecimal("500"));
        when(rs.getBigDecimal("settled_balance")).thenReturn(new BigDecimal("500"));
        when(rs.getBigDecimal("pending_balance")).thenReturn(new BigDecimal("20"));
        when(rs.getBigDecimal("available_balance")).thenReturn(new BigDecimal("450"));
        when(rs.getBigDecimal("total_balance")).thenReturn(new BigDecimal("520"));
        when(rs.getBigDecimal("buffer_percent")).thenReturn(new BigDecimal("1.5"));
        when(rs.getTimestamp("updated_at")).thenReturn(Timestamp.from(now));
        when(rs.getTimestamp("submitted_at")).thenReturn(Timestamp.from(now));
        when(rs.getTimestamp("accepted_at")).thenReturn(accepted ? Timestamp.from(now) : null);
        return Collections.singletonList(mapper.mapRow(rs, 0));
    });
    private final ClientFinancialQueryService service = new ClientFinancialQueryService(jdbc);

    @Test
    void mapsHoldingsCashAndSettlementBreakdown() {
        var holding = service.getHoldings(user).get(0);
        assertThat(holding.accountId()).isEqualTo(account);
        assertThat(holding.instrumentId()).isEqualTo(instrument);
        assertThat(holding.quantity()).isEqualTo(2);
        assertThat(holding.averageCost()).isEqualByComparingTo("90");
        assertThat(holding.updatedAt()).isEqualTo(now);
        var cash = service.getCashBalances(user).get(0);
        assertThat(cash.balance()).isEqualByComparingTo("500");
        assertThat(cash.currency()).isEqualTo("USD");
        var detail = service.getCashBalancesDetailed(user).get(0);
        assertThat(detail.settledBalance()).isEqualByComparingTo("500");
        assertThat(detail.pendingBalance()).isEqualByComparingTo("20");
        assertThat(detail.availableBalance()).isEqualByComparingTo("450");
        assertThat(detail.totalBalance()).isEqualByComparingTo("520");
    }

    @Test
    void mapsOrderIncludingNullableAcceptanceAndBuffer() {
        var result = service.getOrders(user).get(0);
        assertThat(result.orderId()).isEqualTo(order);
        assertThat(result.clientReference()).isEqualTo(reference);
        assertThat(result.submittedAt()).isEqualTo(now);
        assertThat(result.acceptedAt()).isNull();
        assertThat(result.bufferPercent()).isEqualByComparingTo("1.5");
        accepted = true;
        assertThat(service.getOrders(user).get(0).acceptedAt()).isEqualTo(now);
    }

    @Test
    void summaryValuesHoldingsAtLatestQuoteAndAddsTotalCash() {
        var result = service.getPortfolioSummary(user, account);
        assertThat(result.accountId()).isEqualTo(account);
        assertThat(result.holdings()).hasSize(1);
        assertThat(result.totalPortfolioValue()).isEqualByComparingTo("720");
    }

    @Test
    void missingQuoteFailsForPositionButNotZeroQuantity() {
        missingQuote = true;
        assertThatThrownBy(() -> service.getPortfolioSummary(user, account))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(503));
        quantity = 0;
        assertThat(service.getPortfolioSummary(user, account).totalPortfolioValue()).isEqualByComparingTo("520");
    }

    @Test
    void defaultAccountAndSummaryRejectMissingOwnership() {
        assertThat(service.getDefaultAccountId(user)).isEqualTo(account);
        missingAccount = true;
        assertThatThrownBy(() -> service.getDefaultAccountId(user))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(404));
        assertThatThrownBy(() -> service.getPortfolioSummary(user, account))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(404));
    }
}
