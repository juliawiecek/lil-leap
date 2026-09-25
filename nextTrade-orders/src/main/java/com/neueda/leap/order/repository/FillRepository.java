package com.neueda.leap.order.repository;

import com.neueda.leap.order.model.Fill;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Repository for Fill entities.
 * Provides database access for order fills.
 */
@Repository
public interface FillRepository extends JpaRepository<Fill, UUID> {
    
    /**
     * Find a fill by order ID.
     *
     * @param orderId persistent order identifier
     * @return fill for the order, or empty if none exists
     */
    Optional<Fill> findByOrderOrderId(UUID orderId);
}
