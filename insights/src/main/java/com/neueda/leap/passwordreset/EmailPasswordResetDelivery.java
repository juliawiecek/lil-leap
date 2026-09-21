package com.neueda.leap.passwordreset;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/**
 * Delivers password reset information to users by email.
 *
 * <p>The reset email contains a link to the frontend password reset page.
 * During local development, emails are captured by Mailpit.</p>
 */
@Component
public class EmailPasswordResetDelivery implements PasswordResetDelivery {

    private final JavaMailSender mailSender;
    private final String passwordResetUrl;

    /**
     * Creates an email-based password reset delivery service.
     *
     * @param mailSender the Spring mail sender used to send email
     * @param passwordResetUrl the frontend URL used for password reset links
     */
    public EmailPasswordResetDelivery(
            JavaMailSender mailSender,
            @Value("${app.password-reset.url}") String passwordResetUrl
    ) {
        this.mailSender = mailSender;
        this.passwordResetUrl = passwordResetUrl;
    }

    /**
     * Sends a password reset email containing a temporary reset link.
     *
     * @param email the recipient's email address
     * @param token the raw password reset token
     */
    @Override
    public void sendResetToken(String email, String token) {

        String resetLink = passwordResetUrl + "?token=" + token;

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom("no-reply@nexttrade.local");
        message.setTo(email);
        message.setSubject("Reset your NextTrade password");
        message.setText(
                "A password reset was requested for your NextTrade account.\n\n"
                        + "Use the link below to reset your password:\n\n"
                        + resetLink
                        + "\n\nThis link expires in 20 minutes.\n\n"
                        + "If you did not request a password reset, you can ignore this email."
        );

        mailSender.send(message);
    }
}
