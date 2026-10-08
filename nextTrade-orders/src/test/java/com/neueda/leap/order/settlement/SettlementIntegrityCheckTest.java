package com.neueda.leap.order.settlement;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The startup and scheduled check (TS-10.3 AC1) reports findings and survives failures. */
class SettlementIntegrityCheckTest {
    private final SettlementRecoveryService settlements = mock(SettlementRecoveryService.class);
    private final SettlementIntegrityCheck check = new SettlementIntegrityCheck(settlements);

    @Test
    void reportsHowManySettlementsAreIncomplete() {
        when(settlements.reportIncomplete()).thenReturn(List.of(UUID.randomUUID(), UUID.randomUUID()), List.of());

        assertThat(check.run()).isEqualTo(2);
        assertThat(check.run()).isZero();
    }

    @Test
    void runsAtStartupAndOnSchedule() {
        when(settlements.reportIncomplete()).thenReturn(List.of());

        check.onStartup();
        check.onSchedule();

        verify(settlements, times(2)).reportIncomplete();
    }

    @Test
    void databaseFailureIsContainedUntilTheNextRun() {
        when(settlements.reportIncomplete()).thenThrow(new DataAccessResourceFailureException("database unavailable"));

        assertThat(check.run()).isEqualTo(-1);
    }
}
