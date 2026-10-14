package com.neueda.leap.order.execution;

import com.neueda.leap.order.market.MarketHours;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrderExecutionMarketHoursTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private final OrderExecutor executor = mock(OrderExecutor.class);
    private final MarketHours nyse = new MarketHours(ZoneId.of("America/New_York"), LocalTime.of(9, 30), LocalTime.of(16, 0), Set.of(), true);
    private final OrderExecutionWorker.Claim claim = new OrderExecutionWorker.Claim(UUID.randomUUID(), 1);

    private OrderExecutionWorker workerAt(String now) {
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        return new OrderExecutionWorker(jdbc, manager, executor, 30, 10, nyse,
                Clock.fixed(Instant.parse(now), ZoneOffset.UTC));
    }

    @Test
    void aClosedMarketKeepsTheOrderPendingUntilTheNextOpen() {
        workerAt("2026-10-14T21:00:00Z").execute(claim); // 17:00 New York, after the close

        verify(jdbc).update(contains("'MARKET_CLOSED'"), eq(Timestamp.from(Instant.parse("2026-10-15T13:30:00Z"))),
                eq(claim.orderId()), eq(1L));
        verify(executor, never()).execute(any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void anOpenMarketExecutesTheOrder() {
        when(jdbc.query(contains("FOR UPDATE SKIP LOCKED"), any(RowMapper.class), eq(claim.orderId()), anyLong()))
                .thenReturn(List.of(claim.orderId()));
        when(executor.execute(claim.orderId())).thenReturn(OrderExecutor.Result.requeue("STALE_QUOTE"));

        workerAt("2026-10-14T14:00:00Z").execute(claim); // 10:00 New York

        verify(executor).execute(claim.orderId());
        verify(jdbc, never()).update(contains("'MARKET_CLOSED'"), any(Object[].class));
    }
}
