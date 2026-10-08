package com.neueda.leap.order.execution;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class OrderExecutionWorkerLifecycleTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private final OrderExecutor executor = mock(OrderExecutor.class);
    private final List<SimpleTransactionStatus> transactions = new ArrayList<>();
    private final OrderExecutionWorker worker = new OrderExecutionWorker(jdbc, manager, executor, 5);
    private final OrderExecutionWorker.Claim claim = new OrderExecutionWorker.Claim(UUID.randomUUID(), 2);

    @BeforeEach
    void transactionsAreIndependent() {
        when(manager.getTransaction(any())).thenAnswer(invocation -> {
            TransactionDefinition definition = invocation.getArgument(0);
            assertThat(definition.getPropagationBehavior()).isEqualTo(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            var tx = new SimpleTransactionStatus();
            transactions.add(tx);
            return tx;
        });
    }

    private void locked() throws Exception {
        when(jdbc.query(contains("FOR UPDATE SKIP LOCKED"), any(RowMapper.class), eq(claim.orderId()), eq(claim.attempt())))
                .thenAnswer(invocation -> {
                    ResultSet rs = mock(ResultSet.class);
                    when(rs.getObject(1, UUID.class)).thenReturn(claim.orderId());
                    RowMapper<?> mapper = invocation.getArgument(1);
                    return List.of(mapper.mapRow(rs, 0));
                });
    }

    private void deferred(String reason) {
        verify(jdbc).update(contains("ORDER_REQUEUED"), eq(5), eq(reason), eq(claim.orderId()), eq(2L));
        assertThat(transactions).hasSize(2);
        verify(manager).commit(transactions.get(1));
    }

    @Test
    void acceptsBeforeClaimAndMapsPersistedAttempt() throws Exception {
        when(jdbc.query(contains("RETURNING o.order_id"), any(RowMapper.class), eq(5))).thenAnswer(invocation -> {
            ResultSet rs = mock(ResultSet.class);
            when(rs.getObject("order_id", UUID.class)).thenReturn(claim.orderId());
            when(rs.getLong("execution_attempts")).thenReturn(2L);
            RowMapper<?> mapper = invocation.getArgument(1);
            return List.of(mapper.mapRow(rs, 0));
        });
        assertThat(worker.claimNext()).isEqualTo(claim);
        var order = inOrder(jdbc, manager);
        order.verify(jdbc).update(contains("ORDER_ACCEPTED"));
        order.verify(manager).commit(transactions.get(0));
        order.verify(jdbc).query(contains("RETURNING o.order_id"), any(RowMapper.class), eq(5));
        order.verify(manager).commit(transactions.get(1));
    }

    @Test
    void emptyQueueReturnsNoClaim() {
        assertThat(worker.claimNext()).isNull();
        assertThat(transactions).hasSize(2);
        verifyNoInteractions(executor);
    }

    @Test
    void staleOrLockedClaimDoesNotExecute() {
        worker.execute(claim);
        verifyNoInteractions(executor);
        verify(jdbc, never()).update(anyString(), any(Object[].class));
        assertThat(transactions).hasSize(1);
    }

    @Test
    void filledOrderCommitsOnlyAfterFillValidation() throws Exception {
        locked();
        when(executor.execute(claim.orderId())).thenReturn(OrderExecutor.Outcome.FILLED);
        when(jdbc.queryForObject(contains("FROM fills"), eq(Integer.class), eq(claim.orderId()))).thenReturn(1);
        worker.execute(claim);
        verify(jdbc).update(contains("status = 'FILLED'"), eq(claim.orderId()));
        verify(manager).commit(transactions.get(0));
        assertThat(transactions.get(0).isRollbackOnly()).isFalse();
        assertThat(transactions).hasSize(1);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(ints = {0, 2})
    void invalidFillCountRollsBackAndDefers(Integer count) throws Exception {
        locked();
        when(executor.execute(claim.orderId())).thenReturn(OrderExecutor.Outcome.FILLED);
        when(jdbc.queryForObject(contains("FROM fills"), eq(Integer.class), eq(claim.orderId()))).thenReturn(count);
        worker.execute(claim);
        verify(manager).rollback(transactions.get(0));
        verify(jdbc, never()).update(contains("status = 'FILLED'"), eq(claim.orderId()));
        deferred("EXECUTION_FAILED");
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(ints = {0, 1})
    void rejectionRequiresPersistedReason(Integer count) throws Exception {
        locked();
        when(executor.execute(claim.orderId())).thenReturn(OrderExecutor.Outcome.REJECTED);
        when(jdbc.queryForObject(contains("order_status_history"), eq(Integer.class), eq(claim.orderId()))).thenReturn(count);
        worker.execute(claim);
        if (count == null || count == 0) {
            verify(manager).rollback(transactions.get(0));
            deferred("EXECUTION_FAILED");
        } else {
            verify(manager).commit(transactions.get(0));
            assertThat(transactions).hasSize(1);
        }
    }

    @Test
    void pendingRollsBackTradeEffectsAndDefers() throws Exception {
        locked();
        when(executor.execute(claim.orderId())).thenReturn(OrderExecutor.Outcome.PENDING);
        worker.execute(claim);
        assertThat(transactions.get(0).isRollbackOnly()).isTrue();
        deferred("EXECUTION_PENDING");
    }

    @Test
    void executorFailureRollsBackAndDefers() throws Exception {
        locked();
        when(executor.execute(claim.orderId())).thenThrow(new IllegalStateException("database unavailable"));
        worker.execute(claim);
        verify(manager).rollback(transactions.get(0));
        deferred("EXECUTION_FAILED");
    }
}
