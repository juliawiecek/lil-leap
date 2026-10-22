package com.neueda.leap.order.cancel;

import com.neueda.leap.order.query.OrderNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrderCancellationServiceTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final OrderCancellationService service = new OrderCancellationService(jdbc);
    private final UUID orderId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final UUID accountId = UUID.randomUUID();

    @Test
    void recognisesARowLockedByTheWorkerHoweverTheDriverReportsIt() {
        assertThat(OrderCancellationService.isLockedByAnotherTransaction(new CannotAcquireLockException("locked"))).isTrue();
        var nowait = new UncategorizedSQLException("lock", "SELECT", new SQLException("could not obtain lock", "55P03"));
        assertThat(OrderCancellationService.isLockedByAnotherTransaction(nowait)).isTrue();
        var other = new UncategorizedSQLException("other", "SELECT", new SQLException("syntax", "42601"));
        assertThat(OrderCancellationService.isLockedByAnotherTransaction(other)).isFalse();
        assertThat(OrderCancellationService.isLockedByAnotherTransaction(new DataIntegrityViolationException("x"))).isFalse();
    }

    @Test
    void recognisesALockFailureWrappedDeeperInTheCauseChain() {
        var wrapped = new DataIntegrityViolationException("outer",
                new RuntimeException("middle", new SQLException("could not obtain lock", "55P03")));

        assertThat(OrderCancellationService.isLockedByAnotherTransaction(wrapped)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"SUBMITTED", "ACCEPTED", "PENDING", "DELAYED"})
    void waitingOrderIsCancelledWithHistoryAndAudit(String status) throws Exception {
        locks(status);

        var response = service.cancel(orderId, userId);

        assertThat(response.orderId()).isEqualTo(orderId);
        assertThat(response.status()).isEqualTo("CANCELLED");
        assertThat(response.reasonCode()).isEqualTo("CANCELLED_BY_CLIENT");
        assertThat(response.reasonText()).isNull();
        assertThat(response.statusChangedAt()).isBeforeOrEqualTo(Instant.now());
        verify(jdbc).update(contains("UPDATE orders SET status = ?"), eq("CANCELLED"), eq(orderId));
        verify(jdbc).update(contains("INSERT INTO order_status_history"), eq(orderId), eq("CANCELLED"),
                eq("CANCELLED_BY_CLIENT"));
        verify(jdbc).update(contains("'ORDER_CANCELLED'"), eq(accountId), eq(orderId), eq(status), eq(userId.toString()));
    }

    @Test
    void lockQueryIsScopedToTheCallersAccountsAndDoesNotWait() {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(orderId), eq(userId))).thenReturn(List.of());

        assertThatThrownBy(() -> service.cancel(orderId, userId)).isInstanceOf(OrderNotFoundException.class);

        verify(jdbc).query(contains("user_id = ?"), any(RowMapper.class), eq(orderId), eq(userId));
        verify(jdbc).query(contains("FOR UPDATE NOWAIT"), any(RowMapper.class), eq(orderId), eq(userId));
    }

    @Test
    void unknownOrAnotherUsersOrderIsNotFoundAndNothingIsWritten() {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(orderId), eq(userId))).thenReturn(List.of());

        assertThatThrownBy(() -> service.cancel(orderId, userId))
                .isInstanceOf(OrderNotFoundException.class)
                .hasMessage("Order not found");
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"FILLED", "REJECTED", "CANCELLED"})
    void finishedOrderCannotBeCancelled(String status) throws Exception {
        locks(status);

        assertThatThrownBy(() -> service.cancel(orderId, userId))
                .isInstanceOfSatisfying(OrderCancellationException.class, refused -> {
                    assertThat(refused.reason()).isEqualTo(OrderCancellationException.Reason.ORDER_NOT_CANCELLABLE);
                    assertThat(refused.getMessage()).isEqualTo(
                            OrderCancellationException.Reason.ORDER_NOT_CANCELLABLE.message());
                });
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void orderLockedByTheExecutionWorkerIsReportedAsExecuting() {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(orderId), eq(userId)))
                .thenThrow(new UncategorizedSQLException("lock", "SELECT", new SQLException("locked", "55P03")));

        assertThatThrownBy(() -> service.cancel(orderId, userId))
                .isInstanceOfSatisfying(OrderCancellationException.class,
                        refused -> assertThat(refused.reason()).isEqualTo(OrderCancellationException.Reason.ORDER_EXECUTING));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void otherDatabaseFailuresPropagateUnchanged() {
        var failure = new QueryTimeoutException("timeout");
        when(jdbc.query(anyString(), any(RowMapper.class), eq(orderId), eq(userId))).thenThrow(failure);

        assertThatThrownBy(() -> service.cancel(orderId, userId)).isSameAs(failure);
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @SuppressWarnings("unchecked")
    private void locks(String status) throws SQLException {
        ResultSet rs = mock(ResultSet.class);
        when(rs.getString("status")).thenReturn(status);
        when(rs.getObject("account_id", UUID.class)).thenReturn(accountId);
        when(jdbc.query(anyString(), any(RowMapper.class), eq(orderId), eq(userId)))
                .thenAnswer(invocation -> List.of(invocation.<RowMapper<?>>getArgument(1).mapRow(rs, 0)));
    }
}
