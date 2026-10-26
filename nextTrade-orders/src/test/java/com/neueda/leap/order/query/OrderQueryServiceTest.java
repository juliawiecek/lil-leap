package com.neueda.leap.order.query;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OrderQueryServiceTest {
    private final OrderQueryRepository repository = mock(OrderQueryRepository.class);
    private final OrderQueryService service = new OrderQueryService(repository);
    private final UUID order = UUID.randomUUID();
    private final UUID user = UUID.randomUUID();

    @Test
    void returnsTheCallersOrderStatus() {
        OrderStatusResponse status = new OrderStatusResponse(order, "FILLED", "EXECUTION_SUCCESS", null,
                Instant.parse("2026-10-08T12:00:00Z"));
        when(repository.findStatus(order, user)).thenReturn(Optional.of(status));

        assertThat(service.getStatus(order, user)).isSameAs(status);
    }

    @Test
    void returnsTheCallersOrderTrail() {
        OrderEventsResponse trail = new OrderEventsResponse(order, "FILLED", List.of(
                new OrderEvent("SUBMITTED", null, null, Instant.parse("2026-10-08T12:00:00Z"), Map.of())));
        when(repository.findEvents(order, user)).thenReturn(Optional.of(trail));

        assertThat(service.getEvents(order, user)).isSameAs(trail);
    }

    @Test
    void missingOrUnownedOrderIsNotFound() {
        when(repository.findDetail(order, user)).thenReturn(Optional.empty());
        when(repository.findStatus(order, user)).thenReturn(Optional.empty());
        when(repository.findEvents(order, user)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getDetail(order, user)).isInstanceOf(OrderNotFoundException.class);
        assertThatThrownBy(() -> service.getStatus(order, user)).isInstanceOf(OrderNotFoundException.class);
        assertThatThrownBy(() -> service.getEvents(order, user)).isInstanceOf(OrderNotFoundException.class);
    }
}
