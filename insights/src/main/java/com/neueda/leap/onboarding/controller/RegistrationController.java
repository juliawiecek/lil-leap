package com.neueda.leap.onboarding.controller;

import com.neueda.leap.onboarding.dto.RegisterUserRequest;
import com.neueda.leap.onboarding.dto.UserResponse;
import com.neueda.leap.onboarding.service.RegistrationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for onboarding and registration operations.
 *
 * <p>This controller exposes the public registration endpoint used by the
 * frontend onboarding flow.</p>
 */
@RestController
@RequestMapping({"/users", "/clients/register"})
public class RegistrationController {

    /**
     * Service used to handle registration business logic.
     */
    private final RegistrationService registrationService;

    /**
     * Creates a new controller with the required registration service dependency.
     *
     * @param registrationService the service responsible for registration operations
     */
    public RegistrationController(RegistrationService registrationService) {
        this.registrationService = registrationService;
    }

    /**
     * Registers a new user using the supplied request payload.
     *
     * @param request the validated registration request containing user details
     * @return a {@link ResponseEntity} containing the created user's public data
     *         and an HTTP 201 Created status
     */
    @PostMapping
    public ResponseEntity<UserResponse> register(
            @Valid @RequestBody
            RegisterUserRequest request
    ) {
        UserResponse response = registrationService.register(request);

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}



