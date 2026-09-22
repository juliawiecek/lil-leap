package com.neueda.leap.user;

import com.neueda.leap.security.JwtService;
import com.neueda.leap.user.dto.LoginRequest;
import com.neueda.leap.user.dto.LoginResponse;
import com.neueda.leap.user.dto.UserResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for authentication operations.
 *
 * <p>This controller exposes the login endpoint used to exchange a user's
 * credentials for a signed JWT session token.</p>
 */
@RestController
@RequestMapping("/auth")
public class AuthController {

    /**
     * Service used to validate credentials and load the authenticating user.
     */
    private final UserService userService;

    /**
     * Service used to issue a session token once credentials are validated.
     */
    private final JwtService jwtService;

    /**
     * Creates a new controller with the required dependencies.
     *
     * @param userService the service responsible for credential validation
     * @param jwtService the service responsible for issuing session tokens
     */
    public AuthController(UserService userService, JwtService jwtService) {
        this.userService = userService;
        this.jwtService = jwtService;
    }

    /**
     * Authenticates a user and issues a session token.
     *
     * <p>On success, returns a signed JWT alongside the authenticated user's
     * public data. Invalid credentials result in a generic 401 response (see
     * {@link com.neueda.leap.common.exception.GlobalExceptionHandler}) that
     * does not reveal whether the supplied email address is registered.</p>
     *
     * @param request the validated login request containing email and password
     * @return a {@link ResponseEntity} containing the session token and user data
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody
            LoginRequest request
    ) {
        UserResponse user = userService.login(request);
        String token = jwtService.issueToken(user.id(), user.email());

        return ResponseEntity.ok(new LoginResponse(token, user));
    }
}
