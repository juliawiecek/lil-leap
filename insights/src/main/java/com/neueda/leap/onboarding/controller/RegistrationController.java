package com.neueda.leap.onboarding.controller;

import com.neueda.leap.onboarding.dto.RegisterUserRequest;
import com.neueda.leap.onboarding.dto.UserResponse;
import com.neueda.leap.onboarding.service.RegistrationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@RequestMapping("/users")
@Tag(name = "Registration", description = "APIs for user registration and onboarding")
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
    @Operation(
            summary = "Register a new user",
            description = "Creates a new user account with investor onboarding details. " +
                    "Returns the created user's public information with HTTP 201 Created status."
    )
    @ApiResponse(
            responseCode = "201",
            description = "User registered successfully",
            content = @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = UserResponse.class)
            )
    )
    @ApiResponse(
            responseCode = "400",
            description = "Bad Request - Validation failed (missing or invalid fields)"
    )
    @ApiResponse(
            responseCode = "409",
            description = "Conflict - User with this email already exists"
    )
    public ResponseEntity<UserResponse> register(
            @Valid @RequestBody
            RegisterUserRequest request
    ) {
        UserResponse response = registrationService.register(request);

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}



