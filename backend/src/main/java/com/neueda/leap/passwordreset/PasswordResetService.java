package com.neueda.leap.passwordreset;

import com.neueda.leap.user.User;
import com.neueda.leap.user.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * Creates a password reset service.
 *
 * @param userRepository the repository used to access user accounts
 * @param tokenRepository the repository used to store password reset tokens
 * @param tokenUtil the utility used to generate and hash reset tokens
 * @param passwordEncoder the encoder used to securely hash passwords
 * @param delivery the component used to deliver password reset information
 */
@Service
public class PasswordResetService {

    private static final long TOKEN_EXPIRATION_MINUTES = 20;

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordResetTokenUtil tokenUtil;
    private final PasswordEncoder passwordEncoder;
    private final PasswordResetDelivery delivery;

    public PasswordResetService(
            UserRepository userRepository,
            PasswordResetTokenRepository tokenRepository,
            PasswordResetTokenUtil tokenUtil,
            PasswordEncoder passwordEncoder,
            PasswordResetDelivery delivery
    ) {
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
        this.tokenUtil = tokenUtil;
        this.passwordEncoder = passwordEncoder;
        this.delivery = delivery;
    }

    /**
     * Starts the password reset process for the supplied email address.
     *
     * @param email the email address associated with the account
     */
    @Transactional
    public void requestPasswordReset(String email) {

        userRepository.findByEmailIgnoreCase(email)
                .ifPresent(user -> {

                    tokenRepository.deleteByUserId(user.getId());
                    tokenRepository.flush();

                    String rawToken = tokenUtil.generateToken();
                    String tokenHash = tokenUtil.hashToken(rawToken);

                    PasswordResetToken resetToken =
                            new PasswordResetToken(
                                    UUID.randomUUID(),
                                    tokenHash,
                                    user.getId(),
                                    Instant.now().plus(
                                            TOKEN_EXPIRATION_MINUTES,
                                            ChronoUnit.MINUTES
                                    )
                            );

                    tokenRepository.save(resetToken);

                    delivery.sendResetToken(
                            user.getEmail(),
                            rawToken
                    );
                });
    }

    /**
     * Completes a password reset using a valid reset token.
     *
     * @param rawToken the raw password reset token supplied by the user
     * @param newPassword the user's new password
     * @throws InvalidPasswordResetTokenException if the token is invalid or expired
     */
    @Transactional
    public void confirmPasswordReset(
            String rawToken,
            String newPassword
    ) {

        String tokenHash = tokenUtil.hashToken(rawToken);

        PasswordResetToken resetToken =
                tokenRepository.findByTokenHash(tokenHash)
                        .orElseThrow(
                                InvalidPasswordResetTokenException::new
                        );

        if (resetToken.getExpiresAt().isBefore(Instant.now())) {
            tokenRepository.delete(resetToken);
            throw new InvalidPasswordResetTokenException();
        }

        User user = userRepository.findById(resetToken.getUserId())
                .orElseThrow(
                        InvalidPasswordResetTokenException::new
                );

        String newPasswordHash =
                passwordEncoder.encode(newPassword);

        user.setPasswordHash(newPasswordHash);

        userRepository.save(user);

        tokenRepository.delete(resetToken);
    }
}
