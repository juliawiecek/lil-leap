package com.neueda.leap.user;

import com.neueda.leap.security.JwtPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for authenticated user operations.
 *
 * <p>Registration is handled by the onboarding domain. This controller only
 * exposes endpoints that require an authenticated principal.</p>
 */
@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    /**
     * Service used to resolve authenticated user data.
     */
    private final UserService userService;

    /**
     * Creates a new controller with the required service dependency.
     *
     * @param userService the service responsible for user operations
     */
    public UserController(UserService userService) {
        this.userService = userService;
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
    public ResponseEntity<com.neueda.leap.user.dto.UserResponse> me(Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        com.neueda.leap.user.dto.UserResponse response = userService.getById(principal.userId());

        return ResponseEntity.ok(response);
    }
}