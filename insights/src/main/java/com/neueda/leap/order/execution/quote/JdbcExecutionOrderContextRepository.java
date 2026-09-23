package com.neueda.leap.order.execution.quote;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.UUID;
@Repository
public class JdbcExecutionOrderContextRepository implements ExecutionOrderContextRepository {
 private final JdbcTemplate jdbc;
 public JdbcExecutionOrderContextRepository(JdbcTemplate jdbc){this.jdbc=jdbc;}
 public Optional<ExecutionOrderContext> findForExecution(UUID orderId){
  return jdbc.query("""
    SELECT order_id, instrument_id, execution_attempts FROM orders
    WHERE order_id=? AND status='PENDING' AND accepted_at IS NOT NULL
    """,
   (rs,n)->new ExecutionOrderContext(rs.getObject("order_id",UUID.class),rs.getObject("instrument_id",UUID.class),rs.getLong("execution_attempts")),orderId)
   .stream().findFirst();
 }
}
