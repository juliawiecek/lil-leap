package com.neueda.leap.order.execution.quote;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
class JdbcExecutionOrderContextRepositoryTest {
 private JdbcTemplate jdbc; private JdbcExecutionOrderContextRepository repository;
 @BeforeEach void setup(){jdbc=new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DB_CLOSE_DELAY=-1","sa",""));jdbc.execute("CREATE TABLE orders(order_id UUID PRIMARY KEY,instrument_id UUID NOT NULL,status VARCHAR(20) NOT NULL,accepted_at TIMESTAMP WITH TIME ZONE,execution_attempts BIGINT NOT NULL)");repository=new JdbcExecutionOrderContextRepository(jdbc);}
 @Test void readsOnlyAcceptedPendingOrder(){UUID o=UUID.randomUUID(),i=UUID.randomUUID();jdbc.update("INSERT INTO orders VALUES (?,?,'PENDING',CURRENT_TIMESTAMP,2)",o,i);assertThat(repository.findForExecution(o)).contains(new ExecutionOrderContext(o,i,2));}
 @Test void submittedOrderIsIneligible(){UUID o=UUID.randomUUID(),i=UUID.randomUUID();jdbc.update("INSERT INTO orders VALUES (?,?,'SUBMITTED',NULL,0)",o,i);assertThat(repository.findForExecution(o)).isEmpty();}
}
