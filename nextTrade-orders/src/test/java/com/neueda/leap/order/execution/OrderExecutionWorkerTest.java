package com.neueda.leap.order.execution;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@DisplayName("OrderExecutionWorker Unit Tests")
@ExtendWith(MockitoExtension.class)
class OrderExecutionWorkerTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Mock
    private PlatformTransactionManager transactionManager;

    @Mock
    private OrderExecutor orderExecutor;

    @Test
    @DisplayName("Constructor accepts valid retry seconds")
    void testConstructorAcceptsValidRetrySeconds() {
        assertThat(new OrderExecutionWorker(
            jdbcTemplate,
            transactionManager,
            orderExecutor,
            1
        )).isNotNull();

        assertThat(new OrderExecutionWorker(
            jdbcTemplate,
            transactionManager,
            orderExecutor,
            60
        )).isNotNull();
    }

    @Test
    @DisplayName("Constructor rejects zero retry seconds")
    void testConstructorRejectsZeroRetrySeconds() {
        assertThatThrownBy(() -> new OrderExecutionWorker(
            jdbcTemplate,
            transactionManager,
            orderExecutor,
            0
        ))
        .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Constructor rejects negative retry seconds")
    void testConstructorRejectsNegativeRetrySeconds() {
        assertThatThrownBy(() -> new OrderExecutionWorker(
            jdbcTemplate,
            transactionManager,
            orderExecutor,
            -1
        ))
        .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Constructor rejects very large negative retry seconds")
    void testConstructorRejectsLargeNegativeRetrySeconds() {
        assertThatThrownBy(() -> new OrderExecutionWorker(
            jdbcTemplate,
            transactionManager,
            orderExecutor,
            Integer.MIN_VALUE
        ))
        .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Constructor rejects a non-positive attempt limit")
    void testConstructorRejectsNonPositiveAttemptLimit() {
        assertThatThrownBy(() -> new OrderExecutionWorker(jdbcTemplate, transactionManager, orderExecutor, 30, 0))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Transient result requeues with its RETRY_ reason")
    void transientResultRequeuesWithItsReason() {
        var claim = lockedClaim(1);
        when(orderExecutor.execute(claim.orderId())).thenReturn(OrderExecutor.Result.requeue("STALE_QUOTE"));

        worker(3).execute(claim);

        verify(jdbcTemplate).update(contains("ORDER_REQUEUED"), eq(30), eq("RETRY_STALE_QUOTE"),
            eq(claim.orderId()), eq(1L));
    }

    @Test
    @DisplayName("Unexpected failure requeues as RETRY_EXECUTION_FAILED below the attempt limit")
    void unexpectedFailureRequeuesBelowTheLimit() {
        var claim = lockedClaim(2);
        when(orderExecutor.execute(claim.orderId())).thenThrow(new IllegalStateException("database blip"));

        worker(3).execute(claim);

        verify(jdbcTemplate).update(contains("ORDER_REQUEUED"), eq(30), eq("RETRY_EXECUTION_FAILED"),
            eq(claim.orderId()), eq(2L));
        verify(jdbcTemplate, never()).update(contains("ORDER_REJECTED"), any(Object[].class));
    }

    @Test
    @DisplayName("Unexpected failure at the attempt limit rejects as EXECUTION_FAILED")
    void unexpectedFailureAtTheLimitRejects() {
        var claim = lockedClaim(3);
        when(orderExecutor.execute(claim.orderId())).thenReturn(null);

        worker(3).execute(claim);

        verify(jdbcTemplate).update(contains("ORDER_REJECTED"), eq("EXECUTION_FAILED"), eq(claim.orderId()),
            eq(3L), eq("EXECUTION_FAILED"), eq("EXECUTION_FAILED"));
        verify(jdbcTemplate, never()).update(contains("ORDER_REQUEUED"), any(Object[].class));
    }

    @Test
    @DisplayName("Fill is confirmed and nothing is requeued")
    void fillIsConfirmedWithoutRequeue() {
        var claim = lockedClaim(1);
        when(orderExecutor.execute(claim.orderId())).thenReturn(OrderExecutor.Result.filled());
        when(jdbcTemplate.queryForObject(contains("FROM fills"), eq(Integer.class), eq(claim.orderId()))).thenReturn(1);

        worker(3).execute(claim);

        verify(jdbcTemplate).update(contains("status = 'FILLED'"), eq(claim.orderId()));
        verify(jdbcTemplate, never()).update(contains("ORDER_REQUEUED"), any(Object[].class));
    }

    @Test
    @DisplayName("Terminal rejection is confirmed and nothing is requeued")
    void rejectionIsConfirmedWithoutRequeue() {
        var claim = lockedClaim(1);
        when(orderExecutor.execute(claim.orderId())).thenReturn(OrderExecutor.Result.rejected("STALE_QUOTE"));
        when(jdbcTemplate.queryForObject(contains("order_status_history"), eq(Integer.class), eq(claim.orderId())))
            .thenReturn(1);

        worker(3).execute(claim);

        verify(jdbcTemplate, never()).update(contains("ORDER_REQUEUED"), any(Object[].class));
    }

    @Test
    @DisplayName("Claim taken by another worker is skipped")
    void staleClaimIsSkipped() {
        var claim = new OrderExecutionWorker.Claim(UUID.randomUUID(), 1);
        when(transactionManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(jdbcTemplate.query(anyString(), ArgumentMatchers.<RowMapper<UUID>>any(), eq(claim.orderId()), eq(1L)))
            .thenReturn(List.of());

        worker(3).execute(claim);

        verifyNoInteractions(orderExecutor);
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    @Test
    @DisplayName("Result factories mark requeues with the RETRY_ prefix")
    void resultFactoriesDistinguishRequeueFromRejection() {
        assertThat(OrderExecutor.Result.requeue("QUOTE_UNAVAILABLE"))
            .isEqualTo(new OrderExecutor.Result(OrderExecutor.Outcome.PENDING, "RETRY_QUOTE_UNAVAILABLE"));
        assertThat(OrderExecutor.Result.rejected("QUOTE_UNAVAILABLE").reason()).isEqualTo("QUOTE_UNAVAILABLE");
        assertThat(OrderExecutor.Result.filled().reason()).isNull();
    }

    private OrderExecutionWorker worker(long maxAttempts) {
        return new OrderExecutionWorker(jdbcTemplate, transactionManager, orderExecutor, 30, maxAttempts);
    }

    private OrderExecutionWorker.Claim lockedClaim(long attempt) {
        var claim = new OrderExecutionWorker.Claim(UUID.randomUUID(), attempt);
        when(transactionManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(jdbcTemplate.query(anyString(), ArgumentMatchers.<RowMapper<UUID>>any(), eq(claim.orderId()), eq(attempt)))
            .thenReturn(List.of(claim.orderId()));
        return claim;
    }

    @Test
    @DisplayName("Claim record stores orderId and attempt")
    void testClaimRecordStoresData() {
        UUID orderId = UUID.randomUUID();
        int attempt = 3;

        var claim = new OrderExecutionWorker.Claim(orderId, attempt);

        assertThat(claim.orderId()).isEqualTo(orderId);
        assertThat(claim.attempt()).isEqualTo(attempt);
    }

    @Test
    @DisplayName("Claim record equals() works correctly")
    void testClaimRecordEquals() {
        UUID orderId = UUID.randomUUID();
        var claim1 = new OrderExecutionWorker.Claim(orderId, 1);
        var claim2 = new OrderExecutionWorker.Claim(orderId, 1);

        assertThat(claim1).isEqualTo(claim2);
    }

    @Test
    @DisplayName("Claim record not equal for different orderId")
    void testClaimRecordNotEqualDifferentOrderId() {
        var claim1 = new OrderExecutionWorker.Claim(UUID.randomUUID(), 1);
        var claim2 = new OrderExecutionWorker.Claim(UUID.randomUUID(), 1);

        assertThat(claim1).isNotEqualTo(claim2);
    }

    @Test
    @DisplayName("Claim record not equal for different attempt")
    void testClaimRecordNotEqualDifferentAttempt() {
        UUID orderId = UUID.randomUUID();
        var claim1 = new OrderExecutionWorker.Claim(orderId, 1);
        var claim2 = new OrderExecutionWorker.Claim(orderId, 2);

        assertThat(claim1).isNotEqualTo(claim2);
    }

    @Test
    @DisplayName("Claim record hashCode() is consistent")
    void testClaimRecordHashCodeConsistent() {
        var claim = new OrderExecutionWorker.Claim(UUID.randomUUID(), 1);
        int hash1 = claim.hashCode();
        int hash2 = claim.hashCode();

        assertThat(hash1).isEqualTo(hash2);
    }

    @Test
    @DisplayName("Claim record hashCode() same for equal claims")
    void testClaimRecordHashCodeSameForEqual() {
        UUID orderId = UUID.randomUUID();
        var claim1 = new OrderExecutionWorker.Claim(orderId, 1);
        var claim2 = new OrderExecutionWorker.Claim(orderId, 1);

        assertThat(claim1.hashCode()).isEqualTo(claim2.hashCode());
    }

    @Test
    @DisplayName("Claim record toString() produces output")
    void testClaimRecordToString() {
        UUID orderId = UUID.randomUUID();
        var claim = new OrderExecutionWorker.Claim(orderId, 1);
        String str = claim.toString();

        assertThat(str)
            .isNotEmpty()
            .contains("Claim")
            .contains(orderId.toString())
            .contains("1");
    }

    @Test
    @DisplayName("Claim record not equal to null")
    void testClaimRecordNotEqualToNull() {
        var claim = new OrderExecutionWorker.Claim(UUID.randomUUID(), 1);

        assertThat(claim).isNotEqualTo(null);
    }

    @Test
    @DisplayName("Claim record not equal to different type")
    void testClaimRecordNotEqualToDifferentType() {
        var claim = new OrderExecutionWorker.Claim(UUID.randomUUID(), 1);

        assertThat(claim).isNotEqualTo("not a claim");
    }
}

