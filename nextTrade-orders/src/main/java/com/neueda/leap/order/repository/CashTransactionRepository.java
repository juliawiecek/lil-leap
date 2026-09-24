package com.neueda.leap.order.repository;

import com.neueda.leap.order.model.CashTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/**
 * Repository for CashTransaction entities.
 * Provides database access to the append-only cash ledger.
 */
@Repository
public interface CashTransactionRepository extends JpaRepository<CashTransaction, UUID> {
}
