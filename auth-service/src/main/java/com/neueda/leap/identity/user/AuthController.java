package com.neueda.leap.identity.user;

import com.neueda.leap.identity.onboarding.RegistrationService;
import com.neueda.leap.identity.security.JwtPrincipal;
import com.neueda.leap.identity.security.JwtService;
import com.neueda.leap.identity.security.RefreshTokenService;
import com.neueda.leap.identity.user.dto.LoginRequest;
import com.neueda.leap.identity.user.dto.LoginResponse;
import com.neueda.leap.identity.user.dto.RefreshRequest;
import com.neueda.leap.identity.user.dto.RefreshResponse;
import com.neueda.leap.identity.user.dto.RegisterRequest;
import com.neueda.leap.identity.user.dto.UserResponse;
import com.neueda.leap.identity.user.dto.VerifyRequest;
import com.neueda.leap.identity.user.dto.VerifyResponse;
import com.neueda.leap.identity.user.entity.User;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.Optional;

/**
 * REST controller for authentication operations: register, login, and refresh.
 *
 * <p>One shared endpoint per operation for both TRADER and ANALYST roles, per
 * AC2 — {@code userRole} on {@link RegisterRequest} decides which extension
 * table(s) get written, but there is exactly one {@code /register} and one
 * {@code /login} for everyone.</p>
 */
@RestController
public class AuthController {

    private final RegistrationService registrationService;
    private final UserService userService;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;

    /**
     * Creates a new controller with the required dependencies.
     *
     * @param registrationService the service responsible for registration operations
     * @param userService the service responsible for credential validation
     * @param jwtService the service responsible for issuing and validating access tokens
     * @param refreshTokenService the service responsible for issuing and rotating refresh tokens
     */
    public AuthController(
            RegistrationService registrationService,
            UserService userService,
            JwtService jwtService,
            RefreshTokenService refreshTokenService
    ) {
        this.registrationService = registrationService;
        this.userService = userService;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
    }

    /**
     * Registers a new user using the supplied request payload.
     *
     * <p>Does not issue tokens — matches NextTrade backend's existing registration
     * behavior, where creating an account and signing in are separate steps.</p>
     *
     * @param request the validated registration request, for either role
     * @return a {@link ResponseEntity} containing the created user's public data
     *         and an HTTP 201 Created status
     */
    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(
            @Valid @RequestBody
            RegisterRequest request
    ) {
        User user = registrationService.register(request);

        return ResponseEntity.status(HttpStatus.CREATED).body(UserResponse.from(user));
    }

    /**
     * Authenticates a user and issues an access token and refresh token.
     *
     * <p>Invalid credentials result in a generic 401 response (see
     * {@link com.neueda.leap.identity.common.exception.GlobalExceptionHandler}) that
     * does not reveal whether the supplied email address is registered.</p>
     *
     * @param request the validated login request containing email and password
     * @return a {@link ResponseEntity} containing the access token, refresh token, and user data
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody
            LoginRequest request
    ) {
        User user = userService.login(request);
        String accessToken = jwtService.issueToken(user.getUserId(), user.getEmail());
        String refreshToken = refreshTokenService.issue(user);

        return ResponseEntity.ok(new LoginResponse(accessToken, refreshToken, UserResponse.from(user)));
    }

    /**
     * Exchanges a valid refresh token for a new access token, rotating the refresh token.
     *
     * <p>The refresh token in the request is invalidated as part of this call,
     * whether or not the exchange succeeds in the caller's favor — see
     * {@link RefreshTokenService#rotate(String)}.</p>
     *
     * @param request the refresh request containing the current refresh token
     * @return a {@link ResponseEntity} containing a new access token and refresh token
     */
    @PostMapping("/refresh")
    public ResponseEntity<RefreshResponse> refresh(
            @Valid @RequestBody
            RefreshRequest request
    ) {
        RefreshTokenService.RotationResult rotation = refreshTokenService.rotate(request.refreshToken());
        String accessToken = jwtService.issueToken(rotation.user().getUserId(), rotation.user().getEmail());

        return ResponseEntity.ok(new RefreshResponse(accessToken, rotation.newRawRefreshToken()));
    }

    /**
     * Verifies an access token on behalf of another backend (NextTrade, Insights).
     *
     * <p>Per TS-DEVOPS-03, this is the only place a token issued by this
     * service is ever interpreted — other backends call this endpoint instead
     * of parsing/verifying the JWT themselves, so the signing secret never
     * needs to be configured anywhere but here.</p>
     *
     * @param request the token to verify
     * @return the caller's identity if the token is valid, otherwise a 401
     */
    @PostMapping("/verify")
    public ResponseEntity<?> verify(
            @Valid @RequestBody
            VerifyRequest request
    ) {
        Optional<JwtPrincipal> principal = jwtService.validate(request.token());

        if (principal.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "INVALID_TOKEN", "message", "Invalid or expired token."));
        }

        return ResponseEntity.ok(new VerifyResponse(principal.get().userId(), principal.get().email()));
    }
}
