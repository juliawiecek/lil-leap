package com.neueda.leap.user;

import com.neueda.leap.user.dto.RegisterUserRequest;
import com.neueda.leap.user.dto.UserResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for user-related operations.
 *
 * <p>This controller exposes endpoints for managing users, including
 * registering a new user.</p>
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
}