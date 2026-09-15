package com.neueda.leap.passwordreset;

/**
 * Defines how password reset information is delivered to a user.
 */
public interface PasswordResetDelivery {

    /**
     * Delivers a password reset token to the specified email address.
     *
     * @param email the recipient's email address
     * @param token the raw password reset token
     */
    void sendResetToken(String email, String token);
}
