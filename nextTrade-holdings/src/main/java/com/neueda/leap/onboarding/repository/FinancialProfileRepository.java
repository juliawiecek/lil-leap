package com.neueda.leap.onboarding.repository;

import com.neueda.leap.onboarding.entity.FinancialProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * Repository for financial profile persistence operations.
 */
public interface FinancialProfileRepository extends JpaRepository<FinancialProfile, UUID> {
}

