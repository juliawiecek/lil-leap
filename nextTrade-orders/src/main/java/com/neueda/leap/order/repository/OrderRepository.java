package com.neueda.leap.order.repository;

import com.neueda.leap.order.model.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for Order entities.
 * Provides database access for orders with various query patterns.
 */
@Repository
public interface OrderRepository extends JpaRepository<Order, UUID> {
    
    /**
     * Find all accepted orders that are due for execution.
     * Status must be ACCEPTED or PENDING, and next_execution_at must be &lt;= now.
     *
     * @param now now
     * @return accepted or pending orders with acceptance timestamps, ordered by next execution time
     */
    @Query("SELECT o FROM Order o WHERE (o.status = 'ACCEPTED' OR o.status = 'PENDING') " +
           "AND o.acceptedAt IS NOT NULL AND o.nextExecutionAt <= :now " +
           "ORDER BY o.nextExecutionAt ASC")
    List<Order> findDueForExecution(@Param("now") Instant now);
    
    /**
     * Find an order by account and client reference (idempotency check).
     *
     * @param accountId persistent account identifier
     * @param clientReference caller-supplied idempotency key, scoped to the account
     * @return matching order, or empty when absent
     */
    Optional<Order> findByAccountAccountIdAndClientReference(UUID accountId, UUID clientReference);
    
    /**
     * Find all orders with a specific status.
     *
     * @param status persisted order lifecycle status
     * @return orders with the requested status
     */
    List<Order> findByStatus(String status);
    
    /**
     * Find all orders for a specific account.
     *
     * @param accountId persistent account identifier
     * @return orders belonging to the account
     */
    List<Order> findByAccountAccountId(UUID accountId);
}
