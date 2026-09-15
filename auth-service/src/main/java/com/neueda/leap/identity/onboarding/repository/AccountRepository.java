package com.neueda.leap.identity.onboarding.repository;

import com.neueda.leap.identity.onboarding.entity.Account;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * Repository for account persistence operations.
 */
public interface AccountRepository extends JpaRepository<Account, UUID> {
}
