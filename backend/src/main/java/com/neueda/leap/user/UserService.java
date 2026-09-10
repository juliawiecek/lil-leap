package com.neueda.leap.user;

import com.neueda.leap.user.dto.AddressRequest;
import com.neueda.leap.user.dto.LoginRequest;
import com.neueda.leap.user.dto.RegisterUserRequest;
import com.neueda.leap.user.dto.UserResponse;
import com.neueda.leap.user.exception.InvalidCredentialsException;
import com.neueda.leap.user.exception.UserAlreadyExistsException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;
import java.util.UUID;

/**
 * Service responsible for user registration business logic.
 *
 * <p>This service validates uniqueness of the user's email address,
 * normalizes email and country code values, encodes the password,
 * maps request data to entity objects, and persists the new user.</p>
 */
@Service
public class UserService {

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
    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * Registers a new user from the provided request data.
     *
     * <p>The email address is trimmed and normalized to lowercase before being checked
     * for uniqueness. If no existing user is found, a new {@link User} entity is created,
     * the password is encoded, optional address data is mapped, and the user is saved.</p>
     *
     * @param request the registration request containing user details
     * @return a {@link UserResponse} representing the saved user
     * @throws UserAlreadyExistsException if a user with the normalized email already exists
     */
    public UserResponse register(RegisterUserRequest request) {

        String normalizedEmail = request.email().trim().toLowerCase(Locale.ROOT);

        if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new UserAlreadyExistsException("An account with this email already exists.");
        }

        User user = new User();

        user.setFirstName(request.firstName().trim());
        user.setLastName(request.lastName().trim());

        user.setEmail(normalizedEmail);
        user.setPhone(request.phone());

        user.setPasswordHash(passwordEncoder.encode(request.password()));

        user.setEmailVerified(false);

        if (request.address() != null) {
            user.setAddress(toAddress(request.address()));
        }

        User savedUser = userRepository.save(user);

        return UserResponse.from(savedUser);
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
    public UserResponse getById(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Invalid or expired token."));

        return UserResponse.from(user);
    }

    /**
     * Converts an {@link AddressRequest} DTO into an {@link Address} embeddable entity.
     *
     * <p>If a country code is provided, it is normalized to uppercase before storage.</p>
     *
     * @param request the address request to convert
     * @return the mapped address entity
     */
    private Address toAddress(AddressRequest request) {
        Address address = new Address();

        address.setAddressLine1(request.addressLine1());
        address.setAddressLine2(request.addressLine2());
        address.setCity(request.city());
        address.setStateProvince(request.stateProvince());
        address.setPostalCode(request.postalCode());

        if (request.countryCode() != null) {
            address.setCountryCode(request.countryCode().toUpperCase(Locale.ROOT));
        }
        return address;
    }
}