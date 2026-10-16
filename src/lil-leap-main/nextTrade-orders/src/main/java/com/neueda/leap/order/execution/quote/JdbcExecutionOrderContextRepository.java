package com.neueda.leap.order.execution.quote;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.UUID;

/** Reads accepted PENDING orders and their persisted execution attempt counts. */
@Repository
public class JdbcExecutionOrderContextRepository implements ExecutionOrderContextRepository {
    private final JdbcTemplate jdbc;

    /**
     * Creates a {@code JdbcExecutionOrderContextRepository} with the supplied dependencies.
     *
     * @param jdbc JDBC operations participating in Spring transactions
     */
    public JdbcExecutionOrderContextRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Reads the context of an accepted order currently in PENDING status.
     *
     * @param orderId persistent order identifier
     * @return eligible order context, or empty if unavailable or ineligible
     */
    public Optional<ExecutionOrderContext> findForExecution(UUID orderId) {
        return jdbc
                .query(
                        """
                        SELECT order_id, instrument_id, execution_attempts FROM orders
                        WHERE order_id=? AND status='PENDING' AND accepted_at IS NOT NULL
                        """,
                        (rs, n) ->
                                new ExecutionOrderContext(
                                        rs.getObject("order_id", UUID.class),
                                        rs.getObject("instrument_id", UUID.class),
                                        rs.getLong("execution_attempts")),
                        orderId)
                .stream()
                .findFirst();
    }
}
