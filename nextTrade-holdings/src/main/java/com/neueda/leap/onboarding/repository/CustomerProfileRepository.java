package com.neueda.leap.onboarding.repository;

import com.neueda.leap.onboarding.entity.CustomerProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * Repository for customer profile persistence operations.
 */
public interface CustomerProfileRepository extends JpaRepository<CustomerProfile, UUID> {
}

