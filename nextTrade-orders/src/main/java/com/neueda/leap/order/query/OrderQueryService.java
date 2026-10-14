package com.neueda.leap.order.query;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

/** Reads one order on behalf of the authenticated caller. */
@Service
public class OrderQueryService {
    private final OrderQueryRepository repository;

    /**
     * Creates a {@code OrderQueryService} with the supplied dependencies.
     *
     * @param repository caller-scoped order reads
     */
    public OrderQueryService(OrderQueryRepository repository) {
        this.repository = repository;
    }

    /**
     * Returns the full detail of one of the caller's orders.
     *
     * @param orderId persistent order identifier
     * @param userId authenticated user identifier
     * @return the order and its fill, if any
     * @throws OrderNotFoundException if the order does not exist or belongs to another user
     */
    @Transactional(readOnly = true)
    public OrderDetailResponse getDetail(UUID orderId, UUID userId) {
        return repository.findDetail(orderId, userId).orElseThrow(OrderNotFoundException::new);
    }

    /**
     * Returns the current status of one of the caller's orders and its latest status reason.
     *
     * @param orderId persistent order identifier
     * @param userId authenticated user identifier
     * @return the status and the most recent status-history entry
     * @throws OrderNotFoundException if the order does not exist or belongs to another user
     */
    @Transactional(readOnly = true)
    public OrderStatusResponse getStatus(UUID orderId, UUID userId) {
        return repository.findStatus(orderId, userId).orElseThrow(OrderNotFoundException::new);
    }
}
