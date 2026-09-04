package com.neueda.leap.user;

import com.neueda.leap.user.dto.AddressRequest;
import com.neueda.leap.user.dto.RegisterUserRequest;
import com.neueda.leap.user.dto.UserResponse;
import com.neueda.leap.user.exception.UserAlreadyExistsException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @InjectMocks
    private UserService userService;

    @Test
    void register_shouldCreateUser() {

        AddressRequest address = new AddressRequest(
                "123 Main St",
                "Apt 4",
                "Roanoke",
                "TX",
                "76262",
                "us"
        );

        RegisterUserRequest request = new RegisterUserRequest(
                "Julia",
                "Wiecek",
                "JULIA@EXAMPLE.COM",
                "+8175551234",
                "Password123!",
                address
        );

        when(userRepository.existsByEmailIgnoreCase(
                "julia@example.com")).thenReturn(false);

        when(passwordEncoder.encode("Password123!"))
                .thenReturn("hashedPassword");

        when(userRepository.save(any(User.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

            UserResponse response = userService.register(request);

            ArgumentCaptor<User>userCaptor = ArgumentCaptor.forClass(User.class);

            verify(userRepository).save(userCaptor.capture());

                User savedUser = userCaptor.getValue();

                assertEquals("Julia", savedUser.getFirstName());
                assertEquals("Wiecek", savedUser.getLastName());

                assertEquals("julia@example.com", savedUser.getEmail());

                assertEquals("+8175551234", savedUser.getPhone());

                assertEquals("hashedPassword", savedUser.getPasswordHash());

            assertFalse(savedUser.isEmailVerified());

            assertNotNull(savedUser.getAddress());

                assertEquals("123 Main St", savedUser.getAddress().getAddressLine1());

                assertEquals("Roanoke", savedUser.getAddress().getCity());

                assertEquals("TX", savedUser.getAddress().getStateProvince());

                assertEquals("US", savedUser.getAddress().getCountryCode());

                assertEquals("julia@example.com", response.email());

            verify(passwordEncoder).encode("Password123!");
    }

    @Test
    void register_shouldRejectDuplicateEmail() {

        RegisterUserRequest request = new RegisterUserRequest(
                "Julia",
                "Wiecek",
                "julia@example.com",
                "+18175551234",
                "Password123!",
                null
        );

        when(userRepository.existsByEmailIgnoreCase(
                "julia@example.com")).thenReturn(true);

        assertThrows(UserAlreadyExistsException.class, () -> {
            userService.register(request);
        });

            verify(userRepository, never()).save(any(User.class));

        verifyNoInteractions(passwordEncoder);
    }

    @Test
    void register_shouldNormalizeEmailBeforeCheckingDuplicate() {

        RegisterUserRequest request = new RegisterUserRequest(
                "Julia",
                "Wiecek",
                "JULIA@EXAMPLE.COM",
                "+18175551234",
                "Password123!",
                null
        );

        when(userRepository.existsByEmailIgnoreCase(
                "julia@example.com")).thenReturn(true);

        assertThrows(UserAlreadyExistsException.class, () -> {
            userService.register(request);
        });

        verify(userRepository, never()).save(any());
    }
}
