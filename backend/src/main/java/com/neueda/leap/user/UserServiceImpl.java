package com.neueda.leap.user;

import com.neueda.leap.user.dto.LoginRequest;
import com.neueda.leap.user.dto.UserResponse;
import com.neueda.leap.user.entity.User;
import com.neueda.leap.user.exception.InvalidCredentialsException;
import com.neueda.leap.user.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;
import java.util.UUID;

/**
 * Service responsible for authentication-oriented user operations.
 *
 * <p>Registration is handled by the onboarding domain. This service is used
 * for login credential validation and current-user lookups.</p>
 */
@Service
public class UserServiceImpl implements UserService {

    /**
     * Repository used to query and persist user entities.
     */
    private final UserRepository userRepository;

    /**
     * Encoder used to hash user passwords before storage.
     */
    private final PasswordEncoder passwordEncoder;

    /**
     * Creates a new user service with the required dependencies.
     *
     * @param userRepository the repository used for user persistence
     * @param passwordEncoder the password encoder used to hash raw passwords
     */
    public UserServiceImpl(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * Authenticates a user using the supplied email address and password.
     *
     * <p>The stored password hash is compared against the raw password using the
     * configured {@link PasswordEncoder}. To avoid revealing whether a given email
     * is registered, an unknown email and an incorrect password both result in the
     * same {@link InvalidCredentialsException}.</p>
     *
     * @param request the login request containing email and raw password
     * @return a {@link UserResponse} representing the authenticated user
     * @throws InvalidCredentialsException if no user matches the email, or the password is incorrect
     */
    @Override
    public UserResponse login(LoginRequest request) {

        String normalizedEmail = request.email().trim().toLowerCase(Locale.ROOT);

        User user = userRepository.findByEmailIgnoreCase(normalizedEmail)
                .orElseThrow(() -> new InvalidCredentialsException("Invalid email or password."));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new InvalidCredentialsException("Invalid email or password.");
        }

        return UserResponse.from(user);
    }

    /**
     * Looks up a user by their unique identifier, for use by authenticated,
     * token-identified callers (e.g. a "current user" endpoint).
     *
     * <p>A missing user is reported as an HTTP 401 rather than a 404: it means
     * the token's subject no longer corresponds to a real account (for example,
     * the account was deleted after the token was issued), which is an
     * authentication failure from the caller's perspective.</p>
     *
     * @param id the user's unique identifier, as extracted from a validated JWT
     * @return a {@link UserResponse} representing the user
     * @throws ResponseStatusException with status 401 if no user has the given id
     */
    @Override
    public UserResponse getById(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Invalid or expired token."));

        return UserResponse.from(user);
    }

}
