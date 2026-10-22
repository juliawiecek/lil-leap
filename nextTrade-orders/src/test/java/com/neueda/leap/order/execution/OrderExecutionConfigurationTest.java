package com.neueda.leap.order.execution;

import com.neueda.leap.order.execution.event.OrderLifecycleEventPublisher;
import com.neueda.leap.order.market.MarketHours;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

import java.time.Clock;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Property-driven wiring of the execution worker and the batch behaviour of its poller. */
class OrderExecutionConfigurationTest {
    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withUserConfiguration(Collaborators.class, OrderExecutionConfiguration.class)
            // Keeps the scheduled poll from repeating while the context is open.
            .withPropertyValues("orders.execution.poll-ms=600000");

    @Test
    void executionIsWiredWhenThePropertyIsAbsent() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(OrderExecutionWorker.class);
            assertThat(context).hasSingleBean(OrderExecutionConfiguration.Poller.class);
        });
    }

    @Test
    void executionIsWiredWhenExplicitlyEnabledWithCustomSettings() {
        contexts.withPropertyValues("orders.execution.enabled=true", "orders.execution.retry-seconds=5",
                        "orders.execution.max-failure-attempts=3", "orders.execution.batch-size=7")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(OrderExecutionWorker.class);
                    assertThat(context).hasSingleBean(OrderExecutionConfiguration.Poller.class);
                });
    }

    @Test
    void noWorkerOrPollerExistsWhenExecutionIsDisabled() {
        contexts.withPropertyValues("orders.execution.enabled=false").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(OrderExecutionConfiguration.class);
            assertThat(context).doesNotHaveBean(OrderExecutionWorker.class);
            assertThat(context).doesNotHaveBean(OrderExecutionConfiguration.Poller.class);
        });
    }

    @Test
    void nonPositiveBatchSizeFailsStartup() {
        contexts.withPropertyValues("orders.execution.batch-size=0").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause()
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("Batch size must be positive");
        });
    }

    @Test
    void nonPositiveRetryDelayOrAttemptLimitFailsStartup() {
        contexts.withPropertyValues("orders.execution.retry-seconds=0").run(context ->
                assertThat(context.getStartupFailure()).rootCause().hasMessage("Retry delay must be positive"));
        contexts.withPropertyValues("orders.execution.max-failure-attempts=0").run(context ->
                assertThat(context.getStartupFailure()).rootCause().hasMessage("Attempt limit must be positive"));
    }

    @Test
    void pollerRejectsANonPositiveBatchSize() {
        OrderExecutionWorker worker = mock(OrderExecutionWorker.class);

        assertThatThrownBy(() -> new OrderExecutionConfiguration.Poller(worker, 0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new OrderExecutionConfiguration.Poller(worker, -1))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void pollStopsAsSoonAsNoDueOrderRemains() {
        OrderExecutionWorker worker = mock(OrderExecutionWorker.class);
        var first = new OrderExecutionWorker.Claim(UUID.randomUUID(), 1);
        var second = new OrderExecutionWorker.Claim(UUID.randomUUID(), 1);
        when(worker.claimNext()).thenReturn(first, second, null);

        new OrderExecutionConfiguration.Poller(worker, 100).poll();

        verify(worker, times(3)).claimNext();
        verify(worker).execute(first);
        verify(worker).execute(second);
    }

    @Test
    void pollNeverClaimsMoreThanTheBatchSize() {
        OrderExecutionWorker worker = mock(OrderExecutionWorker.class);
        var claim = new OrderExecutionWorker.Claim(UUID.randomUUID(), 1);
        when(worker.claimNext()).thenReturn(claim);

        new OrderExecutionConfiguration.Poller(worker, 2).poll();

        verify(worker, times(2)).claimNext();
        verify(worker, times(2)).execute(claim);
    }

    @Test
    void failureStopsTheBatchWithoutEscapingTheScheduler() {
        OrderExecutionWorker worker = mock(OrderExecutionWorker.class);
        var claim = new OrderExecutionWorker.Claim(UUID.randomUUID(), 1);
        when(worker.claimNext()).thenReturn(claim);
        org.mockito.Mockito.doThrow(new IllegalStateException("database unavailable")).when(worker).execute(claim);
        var poller = new OrderExecutionConfiguration.Poller(worker, 5);

        assertThatCode(poller::poll).doesNotThrowAnyException();

        verify(worker, times(1)).claimNext();
        verify(worker, times(1)).execute(claim);
    }

    @Test
    void claimFailureIsAlsoContained() {
        OrderExecutionWorker worker = mock(OrderExecutionWorker.class);
        when(worker.claimNext()).thenThrow(new IllegalStateException("connection refused"));

        assertThatCode(new OrderExecutionConfiguration.Poller(worker, 5)::poll).doesNotThrowAnyException();

        verify(worker, never()).execute(org.mockito.ArgumentMatchers.any());
    }

    @Configuration(proxyBeanMethods = false)
    static class Collaborators {
        @Bean
        JdbcTemplate jdbcTemplate() {
            return mock(JdbcTemplate.class);
        }

        @Bean
        PlatformTransactionManager transactionManager() {
            return mock(PlatformTransactionManager.class);
        }

        @Bean
        OrderExecutor orderExecutor() {
            return mock(OrderExecutor.class);
        }

        @Bean
        OrderLifecycleEventPublisher orderLifecycleEventPublisher() {
            return orderId -> { };
        }

        @Bean
        MarketHours marketHours() {
            return new MarketHours(ZoneId.of("America/New_York"), LocalTime.of(9, 30), LocalTime.of(16, 0),
                    Set.of(), false);
        }

        @Bean
        Clock clock() {
            return Clock.systemUTC();
        }
    }
}
