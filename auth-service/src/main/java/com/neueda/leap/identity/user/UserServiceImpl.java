package com.neueda.leap.identity.user;

import com.neueda.leap.identity.user.dto.LoginRequest;
import com.neueda.leap.identity.user.entity.User;
import com.neueda.leap.identity.user.exception.InvalidCredentialsException;
import com.neueda.leap.identity.user.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Locale;

/**
 * Service responsible for authentication-oriented user operations.
 *
 * <p>NOTE: does not yet enforce the failed-attempt lockout that
 * {@code failed_login_attempts}/{@code locked_until} exist on {@link User} to
 * support (per BR-03) — NextTrade backend's current login doesn't implement
 * this either. Flagged as a known gap, not implemented here to keep this
 * service's behavior in parity with backend's during the migration; worth
 * its own follow-up story once someone owns that decision.</p>
 */
@Service
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
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
     * {@inheritDoc}
     *
     * <p>The stored password hash is compared against the raw password using the
     * configured {@link PasswordEncoder}. To avoid revealing whether a given email
     * is registered, an unknown email and an incorrect password both result in the
     * same {@link InvalidCredentialsException}.</p>
     */
    @Override
    public User login(LoginRequest request) {
        String normalizedEmail = request.email().trim().toLowerCase(Locale.ROOT);

        User user = userRepository.findByEmailIgnoreCase(normalizedEmail)
                .orElseThrow(() -> new InvalidCredentialsException("Invalid email or password."));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new InvalidCredentialsException("Invalid email or password.");
        }

        return user;
    }
}
