package com.neueda.leap.order.repository;

import com.neueda.leap.order.model.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Append-only repository for audit log events.
 *
 * <p>Provides deterministic query support for idempotency checks and testing.
 * Does not expose update or delete operations; audit_log is write-once.</p>
 *
 * <p>Database-level permissions restrict the runtime application role
 * to INSERT and SELECT only; UPDATE and DELETE operations will fail
 * at the database level regardless of application code.</p>
 */
@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {

    /**
     * Finds audit events related to a specific order.
     *
     * @param orderId order identifier
     * @return all audit events for this order in chronological order
     */
    List<AuditLog> findByRelatedOrderIdOrderByCreatedAtAsc(UUID orderId);

    /**
     * Finds a specific terminal event for an order (for idempotency).
     *
     * @param orderId order identifier
     * @param eventType event type (e.g., ORDER_FILLED, ORDER_REJECTED)
     * @return the terminal event if it exists, or empty if none recorded yet
     */
    @Query("SELECT a FROM AuditLog a WHERE a.relatedOrderId = ?1 AND a.eventType = ?2 ORDER BY a.createdAt DESC LIMIT 1")
    Optional<AuditLog> findLatestTerminalEventForOrder(UUID orderId, String eventType);

    /**
     * Finds all events for an account in a time range (useful for testing, not production queries).
     *
     * @param accountId account identifier
     * @return all audit events for this account in chronological order
     */
    List<AuditLog> findByAccountIdOrderByCreatedAtAsc(UUID accountId);

}
