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
     */
    UserResponse login(LoginRequest request);

    /**
     * Fetches a user by identifier for authenticated caller flows.
     *
     * @param id the user identifier
     * @return a representation of the resolved user
     */
    UserResponse getById(UUID id);
}
