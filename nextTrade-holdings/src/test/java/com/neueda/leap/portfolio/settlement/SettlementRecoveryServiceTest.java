package com.neueda.leap.portfolio.settlement;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SettlementRecoveryServiceTest {
    @Test
    void equalQuantitiesOutsideTheBoxedCacheDoNotTriggerReconciliation() {
        var integrity = mock(SettlementIntegrityRepository.class);
        var jdbc = mock(JdbcTemplate.class);
        UUID accountId = UUID.randomUUID();
        UUID instrumentId = UUID.randomUUID();
        Long cachedQuantity = Long.valueOf("1000");
        Long ledgerQuantity = Long.valueOf("1000");
        assertThat(cachedQuantity).isNotSameAs(ledgerQuantity);
        when(integrity.getHoldingMismatches(accountId)).thenReturn(Map.of(instrumentId,
                new SettlementIntegrityRepository.HoldingMismatch(accountId, instrumentId,
                        cachedQuantity, ledgerQuantity, BigDecimal.ONE, BigDecimal.ONE)));
        when(integrity.getCashMismatch(accountId)).thenReturn(Optional.empty());

        var result = new SettlementRecoveryService(integrity, jdbc).recover(accountId);

        assertThat(result.holdingsReconciled()).isZero();
        verifyNoInteractions(jdbc);
    }
}
