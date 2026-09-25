package com.neueda.leap.onboarding.repository;

import com.neueda.leap.onboarding.entity.Account;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * Repository for account persistence operations.
 */
public interface OnboardingAccountRepository extends JpaRepository<Account, UUID> {
}


