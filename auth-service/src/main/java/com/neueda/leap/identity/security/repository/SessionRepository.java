package com.neueda.leap.identity.security.repository;

import com.neueda.leap.identity.security.entity.Session;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * Repository for refresh-token session persistence operations.
 */
public interface SessionRepository extends JpaRepository<Session, UUID> {

    /**
     * Finds a session by its hashed refresh token.
     *
     * @param tokenHash SHA-256 hash of the raw refresh token
     * @return the matching session, if any
     */
    Optional<Session> findByTokenHash(String tokenHash);
}
