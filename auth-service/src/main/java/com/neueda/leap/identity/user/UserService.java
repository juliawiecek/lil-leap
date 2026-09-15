package com.neueda.leap.identity.user;

import com.neueda.leap.identity.user.dto.LoginRequest;
import com.neueda.leap.identity.user.entity.User;
import com.neueda.leap.identity.user.exception.InvalidCredentialsException;

/**
 * Contract for authentication-oriented user operations.
 */
public interface UserService {

    /**
     * Authenticates a user using the supplied email address and password.
     *
     * @param request the login request containing email and raw password
     * @return the authenticated user entity
     * @throws InvalidCredentialsException if no user matches the email, or the password is incorrect
     */
    User login(LoginRequest request);
}
