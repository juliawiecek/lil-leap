package com.neueda.leap.user;

import com.neueda.leap.user.dto.LoginRequest;
import com.neueda.leap.user.dto.UserResponse;

import java.util.UUID;

/**
 * Contract for authentication-oriented user operations.
 */
public interface UserService {

    /**
     * Authenticates a caller with email and password.
     *
     * @param request the login request payload
     * @return a representation of the authenticated user
     * @throws com.neueda.leap.user.exception.InvalidCredentialsException if the
     *         email is unknown or the password does not match
     */
    UserResponse login(LoginRequest request);

    /**
     * Fetches a user by identifier for authenticated caller flows.
     *
     * @param id the user identifier
     * @return a representation of the resolved user
     * @throws org.springframework.web.server.ResponseStatusException with HTTP 401
     *         if the token's user no longer exists
     */
    UserResponse getById(UUID id);
}
