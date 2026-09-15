package com.neueda.leap.identity.user;

import com.neueda.leap.identity.user.dto.LoginRequest;
import com.neueda.leap.identity.user.entity.User;
import com.neueda.leap.identity.user.exception.InvalidCredentialsException;
import com.neueda.leap.identity.user.repository.UserRepository;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

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
    private UserServiceImpl userService;

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

        User result = userService.login(request);

        assertEquals("julia@example.com", result.getEmail());
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
