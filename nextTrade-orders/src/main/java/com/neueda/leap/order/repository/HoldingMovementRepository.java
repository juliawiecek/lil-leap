package com.neueda.leap.order.repository;

import com.neueda.leap.order.model.HoldingMovement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/**
 * Repository for HoldingMovement entities.
 * Provides database access to the append-only holdings ledger.
 */
@Repository
public interface HoldingMovementRepository extends JpaRepository<HoldingMovement, UUID> {
}
