package com.neueda.leap.user;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * JPA entity representing an application user.
 *
 * <p>This entity stores user profile information, authentication-related data,
 * optional address details, and audit timestamps.</p>
 */
@Entity
@Table(
        name = "users",
        uniqueConstraints = {
                @UniqueConstraint(
                        //uk = unique key
                        name = "uk_users_email",
                        columnNames = "email"
                )
        }
)
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "first_name", nullable = false, length = 100)
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 100)
    private String lastName;

    @Column(nullable = false, length = 320)
    private String email;

    @Column(length = 30)
    private String phone;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Embedded
    private Address address;

    @Column(name = "email_verified", nullable = false)
    private boolean emailVerified = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /**
     * Sets audit timestamps before the entity is first persisted.
     */
    @PrePersist
    protected void onCreate() {
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    /**
     * Updates the modification timestamp before the entity is updated.
     */
    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = Instant.now();
    }

    /**
     * Returns the user's unique identifier.
     *
     * @return the user ID
     */
    public UUID getId() {
        return id;
    }

    /**
     * Sets the user's unique identifier.
     *
     * @param id the user ID
     */
    public void setId(UUID id) {
        this.id = id;
    }

    /**
     * Returns the user's first name.
     *
     * @return the first name
     */
    public String getFirstName() {
        return firstName;
    }

    /**
     * Sets the user's first name.
     *
     * @param firstName the first name
     */
    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    /**
     * Returns the user's last name.
     *
     * @return the last name
     */
    public String getLastName() {
        return lastName;
    }

    /**
     * Sets the user's last name.
     *
     * @param lastName the last name
     */
    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    /**
     * Returns the user's email address.
     *
     * @return the email address
     */
    public String getEmail() {
        return email;
    }

    /**
     * Sets the user's email address.
     *
     * @param email the email address
     */
    public void setEmail(String email) {
        this.email = email;
    }

    /**
     * Returns the user's phone number.
     *
     * @return the phone number
     */
    public String getPhone() {
        return phone;
    }

    /**
     * Sets the user's phone number.
     *
     * @param phone the phone number
     */
    public void setPhone(String phone) {
        this.phone = phone;
    }

    /**
     * Returns the hashed password stored for the user.
     *
     * @return the password hash
     */
    public String getPasswordHash() {
        return passwordHash;
    }

    /**
     * Sets the hashed password stored for the user.
     *
     * @param passwordHash the password hash
     */
    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    /**
     * Returns the user's embedded address.
     *
     * @return the address, or {@code null} if not set
     */
    public Address getAddress() {
        return address;
    }

    /**
     * Sets the user's embedded address.
     *
     * @param address the address to associate with the user
     */
    public void setAddress(Address address) {
        this.address = address;
    }

    /**
     * Indicates whether the user's email address has been verified.
     *
     * @return {@code true} if verified; otherwise {@code false}
     */
    public boolean isEmailVerified() {
        return emailVerified;
    }

    /**
     * Sets the email verification status.
     *
     * @param emailVerified the verification flag
     */
    public void setEmailVerified(boolean emailVerified) {
        this.emailVerified = emailVerified;
    }

    /**
     * Returns the timestamp when the user was created.
     *
     * @return the creation timestamp
     */
    public Instant getCreatedAt() {
        return createdAt;
    }

    /**
     * Sets the timestamp when the user was created.
     *
     * @param createdAt the creation timestamp
     */
    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    /**
     * Returns the timestamp when the user was last updated.
     *
     * @return the last update timestamp
     */
    public Instant getUpdatedAt() {
        return updatedAt;
    }

    /**
     * Sets the timestamp when the user was last updated.
     *
     * @param updatedAt the last update timestamp
     */
    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}