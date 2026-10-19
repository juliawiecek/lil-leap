package com.neueda.leap.order.cancel;

import org.junit.jupiter.api.Test;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.UncategorizedSQLException;

import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;

class OrderCancellationServiceTest {
    @Test
    void recognisesARowLockedByTheWorkerHoweverTheDriverReportsIt() {
        assertThat(OrderCancellationService.isLockedByAnotherTransaction(new CannotAcquireLockException("locked"))).isTrue();
        var nowait = new UncategorizedSQLException("lock", "SELECT", new SQLException("could not obtain lock", "55P03"));
        assertThat(OrderCancellationService.isLockedByAnotherTransaction(nowait)).isTrue();
        var other = new UncategorizedSQLException("other", "SELECT", new SQLException("syntax", "42601"));
        assertThat(OrderCancellationService.isLockedByAnotherTransaction(other)).isFalse();
        assertThat(OrderCancellationService.isLockedByAnotherTransaction(new DataIntegrityViolationException("x"))).isFalse();
    }
}
