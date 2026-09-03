package com.neueda.leap.user;

import com.neueda.leap.user.dto.AddressRequest;
import com.neueda.leap.user.dto.RegisterUserRequest;
import com.neueda.leap.user.dto.UserResponse;
import com.neueda.leap.user.exception.UserAlreadyExistsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

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
