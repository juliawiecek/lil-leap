package com.neueda.leap.order.repository;

import com.neueda.leap.order.dto.OrderHistoryResponse;
import com.neueda.leap.order.model.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
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
    // JOIN FETCH: each order is executed in a later transaction, after this query's session has
    // closed, so its lazy account and instrument must be loaded here or reading them fails.
    @Query("SELECT o FROM Order o JOIN FETCH o.account JOIN FETCH o.instrument " +
           "WHERE (o.status = 'ACCEPTED' OR o.status = 'PENDING') " +
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

    /**
     * Finds a user's order history, newest first, with each order's fill when it has one.
     * BR-11: every filter is always bound (the service supplies the full range and all
     * statuses when the caller omits one), so no nullable parameters reach PostgreSQL.
     *
     * @param userId owner of the accounts whose orders are returned
     * @param statuses statuses to include
     * @param from inclusive lower bound on submission time
     * @param to exclusive upper bound on submission time
     * @return matching orders, most recently submitted first
     */
    @Query("SELECT new com.neueda.leap.order.dto.OrderHistoryResponse(" +
           "o.orderId, i.symbol, o.side, o.quantity, o.status, o.submittedAt, " +
           "f.executionPrice, f.filledQuantity, f.filledAt) " +
           "FROM Order o JOIN o.account a JOIN o.instrument i LEFT JOIN Fill f ON f.order = o " +
           "WHERE a.userId = :userId AND o.status IN :statuses " +
           "AND o.submittedAt >= :from AND o.submittedAt < :to " +
           "ORDER BY o.submittedAt DESC")
    List<OrderHistoryResponse> findHistory(@Param("userId") UUID userId,
                                           @Param("statuses") Collection<String> statuses,
                                           @Param("from") Instant from,
                                           @Param("to") Instant to);
}
