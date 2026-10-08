package com.neueda.leap.order.execution;

import com.neueda.leap.marketdata.MarketQuote;
import com.neueda.leap.order.execution.quote.ExecutionQuoteDecision;
import com.neueda.leap.order.execution.quote.ExecutionQuoteService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.neueda.leap.order.execution.OrderExecutor.Outcome.*;

class JdbcOrderExecutorTest {
    private final UUID orderId = UUID.randomUUID();
    private final UUID accountId = UUID.randomUUID();
    private final UUID instrumentId = UUID.randomUUID();
    private final List<List<Object>> writes = new ArrayList<>();
    private String side = "BUY", status = "ACTIVE";
    private boolean enabled = true, missingOrder, missingAccount, missingCash, missingPosition;
    private Boolean tradable = true, projection = true;
    private long attempts = 1, held = 10;
    private BigDecimal buffer, cash = new BigDecimal("1000"), minimum = BigDecimal.ZERO;
    private final ExecutionQuoteService quotes = mock(ExecutionQuoteService.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class, invocation -> {
        Object[] args = invocation.getArguments();
        if (args.length == 0) return RETURNS_DEFAULTS.answer(invocation);
        String sql = (String) args[0];
        if (invocation.getMethod().getName().equals("update")) {
            writes.add(java.util.Arrays.asList(args));
            return 1;
        }
        if (sql.contains("pg_trigger")) return projection;
        if (sql.contains("FROM instruments")) return tradable;
        if (args.length > 1 && args[1] instanceof RowMapper<?> mapper) {
            ResultSet rs = mock(ResultSet.class);
            if (sql.contains("FROM orders")) {
                if (missingOrder) return null;
                when(rs.getObject(1, UUID.class)).thenReturn(accountId);
                when(rs.getObject(2, UUID.class)).thenReturn(instrumentId);
                when(rs.getString(3)).thenReturn(side);
                when(rs.getLong(4)).thenReturn(2L);
                when(rs.getLong(5)).thenReturn(attempts);
                when(rs.getBigDecimal(6)).thenReturn(buffer);
            } else if (sql.contains("FROM accounts")) {
                if (missingAccount) return null;
                when(rs.getString(1)).thenReturn(status);
                when(rs.getBoolean(2)).thenReturn(enabled);
                when(rs.getBigDecimal(3)).thenReturn(new BigDecimal("1"));
                when(rs.getBigDecimal(4)).thenReturn(minimum);
            } else if (sql.contains("FROM cash_balances")) {
                if (missingCash) return List.of();
                when(rs.getBigDecimal(1)).thenReturn(cash);
            } else if (sql.contains("FROM holdings")) {
                if (missingPosition) return List.of();
                when(rs.getLong(1)).thenReturn(held);
                when(rs.getBigDecimal(2)).thenReturn(new BigDecimal("80"));
            } else throw new AssertionError("Unexpected query: " + sql);
            Object row = mapper.mapRow(rs, 0);
            return invocation.getMethod().getName().equals("query") ? List.of(row) : row;
        }
        return RETURNS_DEFAULTS.answer(invocation);
    });
    private final JdbcOrderExecutor executor = new JdbcOrderExecutor(jdbc, quotes, 3);

    private void quote(String bid, String ask) {
        var value = new MarketQuote(UUID.randomUUID(), instrumentId, "AAPL", "NASDAQ",
                new BigDecimal(bid), new BigDecimal(ask), new BigDecimal("100"),
                OffsetDateTime.parse("2026-10-01T12:00:00Z"), "TEST", true);
        when(quotes.selectForExecution(orderId)).thenReturn(new ExecutionQuoteDecision(
                ExecutionQuoteDecision.Action.CONTINUE, ExecutionQuoteDecision.Reason.QUOTE_FRESH, value, value.quotedAt()));
    }

    private List<Object> write(String fragment) {
        return writes.stream().filter(w -> w.get(0).toString().contains(fragment)).findFirst().orElseThrow();
    }

    private void rejected(String reason) {
        assertThat(executor.execute(orderId)).isEqualTo(REJECTED);
        assertThat(write("UPDATE orders").subList(1, 3)).containsExactly(reason, orderId);
        assertThat(write("INSERT INTO order_status_history").subList(1, 4)).containsExactly(orderId, "REJECTED", reason);
        assertThat(write("ORDER_REJECTED")).contains(orderId);
        assertThat(writes).noneMatch(w -> w.get(0).toString().contains("INSERT INTO fills"));
    }

    @ParameterizedTest
    @ValueSource(longs = {0, -1})
    void rejectsInvalidAttemptLimit(long limit) {
        assertThatThrownBy(() -> new JdbcOrderExecutor(jdbc, quotes, limit)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void requiresEnabledHoldingsProjection() {
        executor.requireHoldingsProjection();
        projection = false;
        assertThatThrownBy(executor::requireHoldingsProjection).isInstanceOf(IllegalStateException.class);
        projection = null;
        assertThatThrownBy(executor::requireHoldingsProjection).hasMessageContaining("008_holdings_projection.sql");
    }

    @Test
    void missingOrderDoesNotSettle() {
        missingOrder = true;
        assertThatThrownBy(() -> executor.execute(orderId)).hasMessage("Order not found");
        assertThat(writes).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing", "inactive", "disabled"})
    void rejectsUnavailableAccountBeforeRequestingQuote(String scenario) {
        missingAccount = scenario.equals("missing");
        status = scenario.equals("inactive") ? "CLOSED" : "ACTIVE";
        enabled = !scenario.equals("disabled");
        rejected("ACCOUNT_NOT_ACTIVE");
        verifyNoInteractions(quotes);
    }

    @Test
    void rejectsDisabledOrMissingInstrument() {
        tradable = false;
        rejected("INSTRUMENT_NOT_TRADABLE");
        tradable = null;
        rejected("INSTRUMENT_NOT_TRADABLE");
        verifyNoInteractions(quotes);
    }

    @Test
    void quoteRequeueDoesNotCreateTradeEffects() {
        when(quotes.selectForExecution(orderId)).thenReturn(new ExecutionQuoteDecision(
                ExecutionQuoteDecision.Action.REQUEUE, ExecutionQuoteDecision.Reason.QUOTE_UNAVAILABLE, null, null));
        assertThat(executor.execute(orderId)).isEqualTo(PENDING);
        assertThat(writes).isEmpty();
    }

    @Test
    void quoteRejectionPreservesReason() {
        when(quotes.selectForExecution(orderId)).thenReturn(new ExecutionQuoteDecision(
                ExecutionQuoteDecision.Action.REJECT, ExecutionQuoteDecision.Reason.STALE_QUOTE, null, null));
        rejected("STALE_QUOTE");
    }

    @ParameterizedTest
    @ValueSource(strings = {"BUY", "SELL"})
    void toleranceRequeuesUntilAttemptLimitThenRejects(String direction) {
        side = direction;
        buffer = BigDecimal.ZERO;
        quote("99", "101");
        assertThat(executor.execute(orderId)).isEqualTo(PENDING);
        assertThat(writes).hasSize(1);
        assertThat(write("PRICE_DECISION")).contains(orderId);
        attempts = 3;
        rejected("PRICE_OUT_OF_TOLERANCE");
    }

    @Test
    void rejectsAccountBelowMinimum() {
        quote("99", "101");
        minimum = new BigDecimal("1001");
        rejected("ACCOUNT_NOT_SUITABLE");
    }

    @Test
    void absentCashBalanceRejectsBuy() {
        quote("99", "101");
        missingCash = true;
        rejected("INSUFFICIENT_CASH");
    }

    @Test
    void absentPositionRejectsSell() {
        quote("99", "101");
        side = "SELL";
        missingPosition = true;
        rejected("INSUFFICIENT_HOLDINGS");
    }

    @ParameterizedTest
    @ValueSource(strings = {"BUY", "SELL"})
    void settlesAtCorrectSideOfQuoteWithLinkedLedgerEntries(String direction) {
        side = direction;
        missingPosition = direction.equals("BUY");
        quote("99", "101"); // Exactly at the account's 1% tolerance boundary.
        assertThat(executor.execute(orderId)).isEqualTo(FILLED);
        BigDecimal price = new BigDecimal(direction.equals("BUY") ? "101" : "99");
        BigDecimal delta = new BigDecimal(direction.equals("BUY") ? "-202.00" : "198.00");
        Object fillId = write("INSERT INTO fills").get(1);
        assertThat(write("INSERT INTO fills")).contains(orderId, 2L, price);
        assertThat(write("INSERT INTO holding_movements").subList(1, 7))
                .containsExactly(accountId, instrumentId, fillId, direction.equals("BUY") ? 2L : -2L, price, direction);
        assertThat(write("INSERT INTO cash_transactions").subList(1, 5)).containsExactly(accountId, fillId, direction, delta);
        assertThat(write("INSERT INTO cash_balances").get(2)).isEqualTo(cash.add(delta));
        assertThat(write("INSERT INTO order_status_history")).contains("FILLED", "EXECUTION_SUCCESS");
        assertThat(write("SETTLEMENT_COMPLETED")).contains(fillId, delta);
    }
}
