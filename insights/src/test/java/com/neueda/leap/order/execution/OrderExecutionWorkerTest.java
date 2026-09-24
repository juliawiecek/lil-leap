package com.neueda.leap.order.execution;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

@DisplayName("OrderExecutionWorker Unit Tests")
@ExtendWith(MockitoExtension.class)
class OrderExecutionWorkerTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Mock
    private PlatformTransactionManager transactionManager;

    @Mock
    private OrderExecutor orderExecutor;

    private OrderExecutionWorker worker;
    private static final int RETRY_SECONDS = 30;

    @BeforeEach
    void setUp() {
        worker = new OrderExecutionWorker(
            jdbcTemplate,
            transactionManager,
            orderExecutor,
            RETRY_SECONDS
        );
    }

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

