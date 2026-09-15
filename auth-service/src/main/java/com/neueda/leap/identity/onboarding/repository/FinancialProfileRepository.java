package com.neueda.leap.identity.onboarding.repository;

import com.neueda.leap.identity.onboarding.entity.FinancialProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * Repository for financial profile persistence operations.
 */
public interface FinancialProfileRepository extends JpaRepository<FinancialProfile, UUID> {
}
