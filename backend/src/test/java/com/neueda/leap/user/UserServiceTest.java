package com.neueda.leap.user;

import com.neueda.leap.user.dto.LoginRequest;
import com.neueda.leap.user.dto.UserResponse;
import com.neueda.leap.user.entity.User;
import com.neueda.leap.user.exception.InvalidCredentialsException;
import com.neueda.leap.user.repository.UserRepository;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
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
    void login_shouldReturnUserWhenPasswordMatchesHash() {

        User existingUser = new User();
        existingUser.setUserId(UUID.randomUUID());
        existingUser.setEmail("julia@example.com");
        existingUser.setPasswordHash("hashedPassword");

        LoginRequest request = new LoginRequest("JULIA@EXAMPLE.COM", "Password123!");

        when(userRepository.findByEmailIgnoreCase("julia@example.com"))
                .thenReturn(Optional.of(existingUser));
        when(passwordEncoder.matches("Password123!", "hashedPassword"))
                .thenReturn(true);

        UserResponse response = userService.login(request);

        assertEquals("julia@example.com", response.email());
        verify(passwordEncoder).matches("Password123!", "hashedPassword");
    }

    @Test
    void login_shouldRejectIncorrectPassword() {

        User existingUser = new User();
        existingUser.setUserId(UUID.randomUUID());
        existingUser.setEmail("julia@example.com");
        existingUser.setPasswordHash("hashedPassword");

        LoginRequest request = new LoginRequest("julia@example.com", "WrongPassword!");

        when(userRepository.findByEmailIgnoreCase("julia@example.com"))
                .thenReturn(Optional.of(existingUser));
        when(passwordEncoder.matches("WrongPassword!", "hashedPassword"))
                .thenReturn(false);

        assertThrows(InvalidCredentialsException.class, () -> userService.login(request));
    }

    @Test
    void login_shouldRejectUnknownEmailWithoutRevealingItsAbsence() {

        LoginRequest request = new LoginRequest("nobody@example.com", "Password123!");

        when(userRepository.findByEmailIgnoreCase("nobody@example.com"))
                .thenReturn(Optional.empty());

        InvalidCredentialsException unknownEmailException = assertThrows(
                InvalidCredentialsException.class, () -> userService.login(request));

        verifyNoInteractions(passwordEncoder);

        User existingUser = new User();
        existingUser.setEmail("julia@example.com");
        existingUser.setPasswordHash("hashedPassword");

        LoginRequest wrongPasswordRequest = new LoginRequest("julia@example.com", "WrongPassword!");

        when(userRepository.findByEmailIgnoreCase("julia@example.com"))
                .thenReturn(Optional.of(existingUser));
        when(passwordEncoder.matches("WrongPassword!", "hashedPassword"))
                .thenReturn(false);

        InvalidCredentialsException wrongPasswordException = assertThrows(
                InvalidCredentialsException.class, () -> userService.login(wrongPasswordRequest));

        assertEquals(unknownEmailException.getMessage(), wrongPasswordException.getMessage());
    }

    @Test
    void getById_shouldReturnUserResponseWhenUserExists() {
        UUID id = UUID.randomUUID();
        User existingUser = new User();
        existingUser.setUserId(id);
        existingUser.setEmail("julia@example.com");
        existingUser.setPasswordHash("hashedPassword");

        when(userRepository.findById(id)).thenReturn(Optional.of(existingUser));

        UserResponse response = userService.getById(id);
        assertEquals(id, response.id());
        assertEquals("julia@example.com", response.email());
    }

    @Test
    void getById_shouldThrowUnauthorizedWhenUserMissing() {
        UUID id = UUID.randomUUID();
        when(userRepository.findById(id)).thenReturn(Optional.empty());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class, () -> userService.getById(id));
        assertEquals(401, exception.getStatusCode().value());
    }

    @Test
    void realBcryptEncoder_shouldHashAndVerifyRoundTrip() {

        PasswordEncoder realEncoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();

        String rawPassword = "Password123!";
        String hash = realEncoder.encode(rawPassword);

        assertNotEquals(rawPassword, hash);
        assertTrue(hash.startsWith("{bcrypt}"));
        assertTrue(realEncoder.matches(rawPassword, hash));
        assertFalse(realEncoder.matches("WrongPassword!", hash));
    }
}
