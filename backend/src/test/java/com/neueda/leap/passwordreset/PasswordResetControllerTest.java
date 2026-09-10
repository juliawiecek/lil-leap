package com.neueda.leap.passwordreset;

import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Tests password reset REST endpoints.
 */
@WebMvcTest(PasswordResetController.class)
@AutoConfigureMockMvc(addFilters = false)
class PasswordResetControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private PasswordResetService passwordResetService;

    @Test
    void requestPasswordReset_shouldReturn200() throws Exception {

        String json = """
                {
                    "email": "alice@nexttrade.com"
                }
                """;

        mockMvc.perform(post("/auth/password-reset/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value(
                        "If an account exists for this email, password reset instructions have been sent."
                ));

        verify(passwordResetService)
                .requestPasswordReset("alice@nexttrade.com");
    }

    @Test
    void requestPasswordReset_shouldReturn400ForInvalidEmail() throws Exception {

        String json = """
                {
                    "email": "not-an-email"
                }
                """;

        mockMvc.perform(post("/auth/password-reset/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(passwordResetService);
    }

    @Test
    void confirmPasswordReset_shouldReturn200() throws Exception {

        String json = """
                {
                    "token": "valid-reset-token",
                    "newPassword": "NewPassword123!"
                }
                """;

        mockMvc.perform(post("/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value(
                        "Password has been reset successfully."
                ));

        verify(passwordResetService)
                .confirmPasswordReset(
                        "valid-reset-token",
                        "NewPassword123!"
                );
    }

    @Test
    void confirmPasswordReset_shouldReturn400ForShortPassword() throws Exception {

        String json = """
                {
                    "token": "valid-reset-token",
                    "newPassword": "123"
                }
                """;

        mockMvc.perform(post("/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(passwordResetService);
    }

    @Test
    void confirmPasswordReset_shouldReturn400ForInvalidToken() throws Exception {

        doThrow(new InvalidPasswordResetTokenException())
                .when(passwordResetService)
                .confirmPasswordReset(
                        "bad-token",
                        "NewPassword123!"
                );

        String json = """
                {
                    "token": "bad-token",
                    "newPassword": "NewPassword123!"
                }
                """;

        mockMvc.perform(post("/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error")
                        .value("INVALID_PASSWORD_RESET_TOKEN"))
                .andExpect(jsonPath("$.message")
                        .value("The password reset token is invalid or has expired."));

        verify(passwordResetService)
                .confirmPasswordReset(
                        "bad-token",
                        "NewPassword123!"
                );
    }

    @Test
    void confirmPasswordReset_shouldReturn400WhenUppercaseIsMissing() throws Exception {

        String json = """
                {
                    "token": "valid-reset-token",
                    "newPassword": "newpassword123!"
                }
                """;

        mockMvc.perform(post("/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(passwordResetService);
    }

    @Test
    void confirmPasswordReset_shouldReturn400WhenLowercaseIsMissing() throws Exception {

        String json = """
                {
                    "token": "valid-reset-token",
                    "newPassword": "NEWPASSWORD123!"
                }
                """;

        mockMvc.perform(post("/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(passwordResetService);
    }

    @Test
    void confirmPasswordReset_shouldReturn400WhenNumberIsMissing() throws Exception {

        String json = """
                {
                    "token": "valid-reset-token",
                    "newPassword": "NewPassword!!!"
                }
                """;

        mockMvc.perform(post("/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(passwordResetService);
    }

    @Test
    void confirmPasswordReset_shouldReturn400WhenSymbolIsMissing() throws Exception {

        String json = """
                {
                    "token": "valid-reset-token",
                    "newPassword": "NewPassword1234"
                }
                """;

        mockMvc.perform(post("/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(passwordResetService);
    }
}