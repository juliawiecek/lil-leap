package com.neueda.leap.identity.onboarding;

import com.neueda.leap.identity.user.dto.RegisterRequest;
import com.neueda.leap.identity.user.entity.User;
import com.neueda.leap.identity.user.exception.UserAlreadyExistsException;

/**
 * Contract for registration business logic.
 */
public interface RegistrationService {

    /**
     * Registers a new user from the provided request data.
     *
     * <p>Writes {@code users} plus, depending on {@code request.userRole()},
     * either {@code customer_profiles} + {@code financial_profiles} +
     * {@code accounts} (TRADER) or {@code analyst_profiles} (ANALYST) — see AC2.</p>
     *
     * @param request the registration request, for either role
     * @return the newly created user entity
     * @throws UserAlreadyExistsException if a user with the normalized email already exists
     */
    User register(RegisterRequest request);
}
