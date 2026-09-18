package com.neueda.leap.onboarding.service;

import com.neueda.leap.onboarding.dto.RegisterUserRequest;
import com.neueda.leap.onboarding.dto.UserResponse;

/**
 * Contract for user onboarding and registration operations.
 */
public interface RegistrationService {

    /**
     * Registers a new user with onboarding details.
     *
     * @param request the registration payload
     * @return a representation of the newly registered user
     * @throws com.neueda.leap.user.exception.UserAlreadyExistsException if the
     *         normalized email is already registered
     * @throws IllegalArgumentException if the date of birth is missing or the user is under 18
     */
    UserResponse register(RegisterUserRequest request);
}

