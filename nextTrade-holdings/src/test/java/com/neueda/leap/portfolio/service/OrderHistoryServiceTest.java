package com.neueda.leap.portfolio.service;

import com.neueda.leap.portfolio.service.InvalidFilterException;
import com.neueda.leap.portfolio.repository.OrderHistoryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * Unit tests for how OrderHistoryService turns request filters into query bounds (NEXT-117).
 */
@ExtendWith(MockitoExtension.class)
class OrderHistoryServiceTest {

    @Mock
    private OrderHistoryRepository orderRepository;

    private OrderHistoryService service;

    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new OrderHistoryService(orderRepository);
    }

    @Test
    void noFiltersQueriesTheFullHistory() {
        service.getHistory(userId, null, null, null);

        verify(orderRepository).findHistory(eq(userId), eq(OrderHistoryService.ALL_STATUSES),
                eq(Instant.EPOCH), eq(Instant.parse("9999-12-31T00:00:00Z")));
    }

    @Test
    void statusIsCaseInsensitive() {
        service.getHistory(userId, null, null, "filled");

        verify(orderRepository).findHistory(eq(userId), eq(Set.of("FILLED")), eq(Instant.EPOCH),
                eq(Instant.parse("9999-12-31T00:00:00Z")));
    }

    @Test
    void toDateIncludesTheWholeDay() {
        service.getHistory(userId, LocalDate.parse("2026-09-01"), LocalDate.parse("2026-09-30"), null);

        verify(orderRepository).findHistory(eq(userId), eq(OrderHistoryService.ALL_STATUSES),
                eq(Instant.parse("2026-09-01T00:00:00Z")), eq(Instant.parse("2026-10-01T00:00:00Z")));
    }

    @Test
    void singleDayUsesTheSameDateForBoth() {
        service.getHistory(userId, LocalDate.parse("2026-09-15"), LocalDate.parse("2026-09-15"), null);

        verify(orderRepository).findHistory(eq(userId), eq(OrderHistoryService.ALL_STATUSES),
                eq(Instant.parse("2026-09-15T00:00:00Z")), eq(Instant.parse("2026-09-16T00:00:00Z")));
    }

    @Test
    void unknownStatusIsRejectedWithoutQuerying() {
        assertThrows(InvalidFilterException.class, () -> service.getHistory(userId, null, null, "SHIPPED"));

        verifyNoInteractions(orderRepository);
    }

    @Test
    void fromAfterToIsRejectedWithoutQuerying() {
        assertThrows(InvalidFilterException.class, () ->
                service.getHistory(userId, LocalDate.parse("2026-09-30"), LocalDate.parse("2026-09-01"), null));

        verifyNoInteractions(orderRepository);
    }
}
