package com.neueda.leap.passwordreset;

import org.springframework.stereotype.Component;

/**
 * Provides a temporary development implementation for delivering
 * password reset tokens.
 */
@Component
public class ConsolePasswordResetDelivery implements PasswordResetDelivery {

    /**
     * Writes the password reset token to the application console.
     *
     * @param email the recipient's email address
     * @param token the raw password reset token
     */
    @Override
    public void sendResetToken(String email, String token) {

        System.out.println(
                "PASSWORD RESET TOKEN for " + email + ": " + token
        );
    }
}
