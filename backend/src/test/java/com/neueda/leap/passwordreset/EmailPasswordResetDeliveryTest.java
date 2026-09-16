package com.neueda.leap.passwordreset;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * Tests email delivery for password reset requests.
 */
class EmailPasswordResetDeliveryTest {

    private JavaMailSender mailSender;
    private EmailPasswordResetDelivery delivery;

    @BeforeEach
    void setUp() {
        mailSender = mock(JavaMailSender.class);

        delivery = new EmailPasswordResetDelivery(
                mailSender,
                "http://localhost:4200/reset-password"
        );
    }

    @Test
    void sendResetToken_shouldSendPasswordResetEmailWithCorrectLink() {

        String email = "alice@nexttrade.com";
        String token = "test-reset-token";

        delivery.sendResetToken(email, token);

        ArgumentCaptor<SimpleMailMessage> captor =
                ArgumentCaptor.forClass(SimpleMailMessage.class);

        verify(mailSender).send(captor.capture());

        SimpleMailMessage sentMessage = captor.getValue();

        assertNotNull(sentMessage);
        assertEquals("no-reply@nexttrade.local", sentMessage.getFrom());
        assertEquals("Reset your NextTrade password", sentMessage.getSubject());

        assertNotNull(sentMessage.getTo());
        assertEquals(email, sentMessage.getTo()[0]);

        assertNotNull(sentMessage.getText());

        assertTrue(
                sentMessage.getText().contains(
                        "http://localhost:4200/reset-password?token=test-reset-token"
                )
        );

        assertTrue(sentMessage.getText().contains("expires in 20 minutes"));
    }
}
