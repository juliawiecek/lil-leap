package com.neueda.leap.passwordreset;

import com.neueda.leap.user.User;
import com.neueda.leap.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.UUID;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.times; 

/**
 * Tests password reset business logic.
 */
@ExtendWith(MockitoExtension.class)
class PasswordResetServiceTest {
    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordResetTokenRepository tokenRepository;

    @Mock
    private PasswordResetTokenUtil tokenUtil;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private PasswordResetDelivery delivery;

    @Mock
    private User user;

    private PasswordResetService passwordResetService;

    @BeforeEach
    void setUp() {
        passwordResetService = new PasswordResetService(
                userRepository,
                tokenRepository,
                tokenUtil,
                passwordEncoder,
                delivery
        );
    }
    @Test
    void requestPasswordResetCreatesAndDeliversTokenForExistingUser() {

        String email = "alice@nexttrade.com";
        UUID userId = UUID.randomUUID();

        String rawToken = "raw-reset-token";
        String tokenHash = "hashed-reset-token";

        when(userRepository.findByEmailIgnoreCase(email))
                .thenReturn(Optional.of(user));

        when(user.getId())
                .thenReturn(userId);

        when(user.getEmail())
                .thenReturn(email);

        when(tokenUtil.generateToken())
                .thenReturn(rawToken);

        when(tokenUtil.hashToken(rawToken))
                .thenReturn(tokenHash);

        passwordResetService.requestPasswordReset(email);

        verify(tokenRepository)
            .deleteByUserId(userId);

        verify(tokenRepository)
            .flush();

        ArgumentCaptor<PasswordResetToken> tokenCaptor =
                ArgumentCaptor.forClass(PasswordResetToken.class);

        verify(tokenRepository)
                .save(tokenCaptor.capture());

        PasswordResetToken savedToken = tokenCaptor.getValue();

        assertEquals(tokenHash, savedToken.getTokenHash());
        assertEquals(userId, savedToken.getUserId());
        assertNotNull(savedToken.getId());
        assertNotNull(savedToken.getExpiresAt());

        verify(delivery)
                .sendResetToken(email, rawToken);
    }

    @Test
    void requestPasswordResetDoesNothingForUnknownEmail() {

        String email = "unknown@nexttrade.com";

        when(userRepository.findByEmailIgnoreCase(email))
                .thenReturn(Optional.empty());

        passwordResetService.requestPasswordReset(email);

        verifyNoInteractions(
                tokenRepository,
                tokenUtil,
                passwordEncoder,
                delivery
        );
    }

    @Test
    void confirmPasswordResetChangesPasswordAndDeletesToken() {

        String rawToken = "raw-reset-token";
        String tokenHash = "hashed-reset-token";
        String newPassword = "NewPassword123!";
        String encodedPassword = "encoded-new-password";

        UUID userId = UUID.randomUUID();

        PasswordResetToken resetToken = new PasswordResetToken(
                UUID.randomUUID(),
                tokenHash,
                userId,
                Instant.now().plus(20, ChronoUnit.MINUTES)
        );

        when(tokenUtil.hashToken(rawToken))
                .thenReturn(tokenHash);

        when(tokenRepository.findByTokenHash(tokenHash))
                .thenReturn(Optional.of(resetToken));

        when(userRepository.findById(userId))
                .thenReturn(Optional.of(user));

        when(passwordEncoder.encode(newPassword))
                .thenReturn(encodedPassword);

        passwordResetService.confirmPasswordReset(
                rawToken,
                newPassword
        );

        verify(passwordEncoder)
                .encode(newPassword);

        verify(user)
                .setPasswordHash(encodedPassword);

        verify(userRepository)
                .save(user);

        verify(tokenRepository)
                .delete(resetToken);
    }

    @Test
    void confirmPasswordResetRejectsInvalidToken() {

        String rawToken = "bad-token";
        String tokenHash = "hashed-bad-token";
        String newPassword = "NewPassword123!";

        when(tokenUtil.hashToken(rawToken))
                .thenReturn(tokenHash);

        when(tokenRepository.findByTokenHash(tokenHash))
                .thenReturn(Optional.empty());

        assertThrows(
                InvalidPasswordResetTokenException.class,
                () -> passwordResetService.confirmPasswordReset(
                        rawToken,
                        newPassword
                )
        );

        verifyNoInteractions(
                userRepository,
                passwordEncoder,
                delivery
        );
    }

    @Test
    void confirmPasswordResetRejectsExpiredToken() {

        String rawToken = "expired-token";
        String tokenHash = "hashed-expired-token";
        String newPassword = "NewPassword123!";

        UUID userId = UUID.randomUUID();

        PasswordResetToken expiredToken = new PasswordResetToken(
                UUID.randomUUID(),
                tokenHash,
                userId,
                Instant.now().minus(5, ChronoUnit.MINUTES)
        );

        when(tokenUtil.hashToken(rawToken))
                .thenReturn(tokenHash);

        when(tokenRepository.findByTokenHash(tokenHash))
                .thenReturn(Optional.of(expiredToken));

        assertThrows(
                InvalidPasswordResetTokenException.class,
                () -> passwordResetService.confirmPasswordReset(
                        rawToken,
                        newPassword
                )
        );

        verify(tokenRepository)
                .delete(expiredToken);

        verifyNoInteractions(
                userRepository,
                passwordEncoder,
                delivery
        );
    }

    @Test
    void confirmPasswordResetRejectsReusedToken() {

        String rawToken = "single-use-token";
        String tokenHash = "hashed-single-use-token";
        String newPassword = "NewPassword123!";
        String encodedPassword = "encoded-new-password";

        UUID userId = UUID.randomUUID();

        PasswordResetToken resetToken = new PasswordResetToken(
                UUID.randomUUID(),
                tokenHash,
                userId,
                Instant.now().plus(20, ChronoUnit.MINUTES)
        );

        when(tokenUtil.hashToken(rawToken))
                .thenReturn(tokenHash);

        when(tokenRepository.findByTokenHash(tokenHash))
                .thenReturn(Optional.of(resetToken))
                .thenReturn(Optional.empty());

        when(userRepository.findById(userId))
                .thenReturn(Optional.of(user));

        when(passwordEncoder.encode(newPassword))
                .thenReturn(encodedPassword);

        // First attempt succeeds.
        passwordResetService.confirmPasswordReset(
                rawToken,
                newPassword
        );

        // Second attempt with the exact same token must fail.
        assertThrows(
                InvalidPasswordResetTokenException.class,
                () -> passwordResetService.confirmPasswordReset(
                        rawToken,
                        newPassword
                )
        );

        verify(tokenRepository)
                .delete(resetToken);

        verify(passwordEncoder, times(1))
                .encode(newPassword);

        verify(user, times(1))
                .setPasswordHash(encodedPassword);

        verify(userRepository, times(1))
                .save(user);
    }
}