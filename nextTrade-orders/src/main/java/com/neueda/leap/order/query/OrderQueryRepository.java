package com.neueda.leap.order.query;

import java.util.Optional;
import java.util.UUID;

/** Persistence contract for reading one order, scoped to the user who owns its account. */
public interface OrderQueryRepository {
    /**
     * Reads an order and its fill, if any, only when its account belongs to the user.
     *
     * @param orderId persistent order identifier
     * @param userId authenticated user identifier
     * @return the order, or empty when it does not exist or belongs to another user
     */
    Optional<OrderDetailResponse> findDetail(UUID orderId, UUID userId);

    /**
     * Reads an order's current status and its most recent status-history entry,
     * only when its account belongs to the user.
     *
     * @param orderId persistent order identifier
     * @param userId authenticated user identifier
     * @return the status, or empty when the order does not exist or belongs to another user
     */
    Optional<OrderStatusResponse> findStatus(UUID orderId, UUID userId);
}
