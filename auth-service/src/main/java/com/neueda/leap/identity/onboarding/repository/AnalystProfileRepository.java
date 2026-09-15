package com.neueda.leap.identity.onboarding.repository;

import com.neueda.leap.identity.onboarding.entity.AnalystProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * Repository for analyst profile persistence operations.
 */
public interface AnalystProfileRepository extends JpaRepository<AnalystProfile, UUID> {
}
