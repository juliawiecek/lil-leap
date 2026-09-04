package com.neueda.leap.user;

import com.neueda.leap.user.dto.AddressRequest;
import com.neueda.leap.user.dto.RegisterUserRequest;
import com.neueda.leap.user.dto.UserResponse;
import com.neueda.leap.user.exception.UserAlreadyExistsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Locale;

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