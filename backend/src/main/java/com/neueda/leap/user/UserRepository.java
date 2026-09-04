package com.neueda.leap.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * Repository interface for performing persistence operations on {@link User} entities.
 *
 * <p>Extends {@link JpaRepository} to provide standard CRUD operations and
 * defines additional query methods for working with user email addresses.</p>
 */
public interface UserRepository extends JpaRepository<User, UUID> {

    /**
     * Checks whether a user exists with the given email address, ignoring case.
     *
     * @param email the email address to check
     * @return {@code true} if a user with the email exists; otherwise {@code false}
     */
    boolean existsByEmailIgnoreCase(String email);

    /**
     * Finds a user by email address, ignoring case.
     *
     * @param email the email address to search for
     * @return an {@link Optional} containing the matching user if found,
     *         or an empty optional if no user exists with that email
     */
    Optional<User> findByEmailIgnoreCase(String email);
}