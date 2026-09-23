package com.neueda.leap.order.repository;

import com.neueda.leap.order.model.Account;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/**
 * Repository for Account entities.
 * Provides database access for trading accounts.
 */
@Repository
public interface AccountRepository extends JpaRepository<Account, UUID> {
}
