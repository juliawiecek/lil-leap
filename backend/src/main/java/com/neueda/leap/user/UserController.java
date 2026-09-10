package com.neueda.leap.user;

import com.neueda.leap.security.JwtPrincipal;
import com.neueda.leap.user.dto.RegisterUserRequest;
import com.neueda.leap.user.dto.UserResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for user-related operations.
 *
 * <p>This controller exposes endpoints for managing users, including
 * registering a new user and retrieving the current authenticated user.</p>
 */
@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    /**
     * Service used to handle user registration business logic.
     */
    private final UserService userService;

    /**
     * Creates a new controller with the required user service dependency.
     *
     * @param userService the service responsible for user operations
     */
    public UserController(UserService userService) {
        this.userService = userService;
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
        UserResponse response = userService.register(request);

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Returns the currently authenticated user's public data.
     *
     * <p>Requires a valid bearer token; the caller's identity is resolved from
     * the {@link JwtPrincipal} that {@code JwtAuthenticationFilter} attaches to
     * the request's {@link Authentication}.</p>
     *
     * @param authentication the current request's authentication, populated by the JWT filter
     * @return a {@link ResponseEntity} containing the authenticated user's public data
     */
    @GetMapping("/me")
    public ResponseEntity<UserResponse> me(Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        UserResponse response = userService.getById(principal.userId());

        return ResponseEntity.ok(response);
    }
}