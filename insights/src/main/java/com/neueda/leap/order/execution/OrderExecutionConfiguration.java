package com.neueda.leap.order.execution;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Configures database-backed execution polling when {@code orders.execution.enabled} is true or absent.
 * The fallback executor returns PENDING until an execution implementation is supplied.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "orders.execution.enabled", havingValue = "true", matchIfMissing = true)
public class OrderExecutionConfiguration {

    /** Creates the Spring configuration for this component. */
    public OrderExecutionConfiguration() {
    }
    @Bean
    OrderExecutionWorker orderExecutionWorker(JdbcTemplate jdbc, PlatformTransactionManager manager,
            ObjectProvider<OrderExecutor> executor,
            @Value("${orders.execution.retry-seconds:30}") int retrySeconds) {
        return new OrderExecutionWorker(jdbc, manager,
                executor.getIfAvailable(() -> orderId -> OrderExecutor.Outcome.PENDING), retrySeconds);
    }

    @Bean
    Poller orderExecutionPoller(OrderExecutionWorker worker,
            @Value("${orders.execution.batch-size:100}") int batchSize) {
        return new Poller(worker, batchSize);
    }

    /** First poll on startup and subsequent polls always reload work from the database. */
    static class Poller {
        private static final Logger log = LoggerFactory.getLogger(Poller.class);
        private final OrderExecutionWorker worker;
        private final int batchSize;

        Poller(OrderExecutionWorker worker, int batchSize) {
            if (batchSize < 1) throw new IllegalArgumentException("Batch size must be positive");
            this.worker = worker;
            this.batchSize = batchSize;
        }

        /**
         * Claims and executes up to the configured batch size, stopping when no due order remains.
         */
        @Scheduled(fixedDelayString = "${orders.execution.poll-ms:1000}")
        public void poll() {
            try {
                for (int i = 0; i < batchSize; i++) {
                    var claim = worker.claimNext();
                    if (claim == null) return;
                    worker.execute(claim);
                }
            } catch (RuntimeException failure) {
                // Avoid logging exception text that could contain client order details.
                log.warn("Order processing interrupted; persisted work will be retried ({})",
                        failure.getClass().getSimpleName());
            }
        }
    }
}
