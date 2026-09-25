package com.neueda.leap.user.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Authentication-focused user entity mapped to the normalized users table.
 *
 * <p>Identity and financial onboarding concerns are stored in separate tables.
 * This entity keeps only credentials, lockout metadata, and audit timestamps.</p>
 */
@Entity
@Table(name = "users")
public class User {

    /** Creates an empty entity for JPA hydration or application initialization. */
    public User() {
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "email", nullable = false, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "ssn")
    private String ssn;

    @Column(name = "user_role", nullable = false, length = 20)
    private String userRole = "TRADER";

    @Column(name = "failed_login_attempts", nullable = false)
    private int failedLoginAttempts;

    @Column(name = "locked_until")
    private OffsetDateTime lockedUntil;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** Initializes creation and update timestamps before the first insert. */
    @PrePersist
    protected void onCreate() {
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    /** Refreshes the update timestamp before an entity update. */
    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = Instant.now();
    }

    /**
     * Returns the primary key value.
     *
     * @return user id
     */
    public UUID getUserId() {
        return userId;
    }

    /**
     * Sets the primary key value.
     *
     * @param userId user id
     */
    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    /**
     * Compatibility alias used by existing code paths.
     *
     * @return user id
     */
    public UUID getId() {
        return userId;
    }

    /**
     * Compatibility alias used by existing code paths.
     *
     * @param id user id
     */
    public void setId(UUID id) {
        this.userId = id;
    }

    /**
    * Returns email address used for authentication.
    * @return email address used for authentication
    */
    public String getEmail() {
        return email;
    }

    /**
    * Sets email address used for authentication.
    * @param email email address used for authentication
    */
    public void setEmail(String email) {
        this.email = email;
    }

    /**
    * Returns encoded password hash, never a plaintext password.
    * @return encoded password hash, never a plaintext password
    */
    public String getPasswordHash() {
        return passwordHash;
    }

    /**
    * Sets encoded password hash, never a plaintext password.
    * @param passwordHash encoded password hash, never a plaintext password
    */
    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    /**
     * Returns stored social security number.
     *
     * @return stored social security number
     */
    public String getSsn() {
        return ssn;
    }

    /**
     * Sets stored social security number.
     *
     * @param ssn stored social security number
     */
    public void setSsn(String ssn) {
        this.ssn = ssn;
    }

    /**
    * Returns stored application role.
    * @return stored application role
    */
    public String getUserRole() {
        return userRole;
    }

    /**
    * Sets stored application role.
    * @param userRole stored application role
    */
    public void setUserRole(String userRole) {
        this.userRole = userRole;
    }

    /**
    * Returns recorded number of failed login attempts.
    * @return recorded number of failed login attempts
    */
    public int getFailedLoginAttempts() {
        return failedLoginAttempts;
    }

    /**
    * Sets recorded number of failed login attempts.
    * @param failedLoginAttempts recorded number of failed login attempts
    */
    public void setFailedLoginAttempts(int failedLoginAttempts) {
        this.failedLoginAttempts = failedLoginAttempts;
    }

    /**
    * Returns lockout expiration time, or null when no lockout is recorded.
    * @return lockout expiration time, or null when no lockout is recorded
    */
    public OffsetDateTime getLockedUntil() {
        return lockedUntil;
    }

    /**
    * Sets lockout expiration time, or null when no lockout is recorded.
    * @param lockedUntil lockout expiration time, or null when no lockout is recorded
    */
    public void setLockedUntil(OffsetDateTime lockedUntil) {
        this.lockedUntil = lockedUntil;
    }

    /**
    * Returns creation timestamp assigned before initial persistence.
    * @return creation timestamp assigned before initial persistence
    */
    public Instant getCreatedAt() {
        return createdAt;
    }

    /**
    * Returns timestamp assigned before the latest persistence update.
    * @return timestamp assigned before the latest persistence update
    */
    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
