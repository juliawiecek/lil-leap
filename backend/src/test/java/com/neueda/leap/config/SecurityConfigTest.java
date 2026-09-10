package com.neueda.leap.config;

import com.neueda.leap.security.JwtService;
import com.neueda.leap.user.UserController;
import com.neueda.leap.user.UserService;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.neueda.leap.passwordreset.PasswordResetController;
import com.neueda.leap.passwordreset.PasswordResetService;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Verifies the security filter chain's behavior on a protected route with the
 * real filter chain active (unlike {@code UserControllerTest}, which disables
 * filters to test the controller in isolation).
 */
@WebMvcTest({
        UserController.class,
        PasswordResetController.class
})
@Import({SecurityConfig.class, JwtService.class})
class SecurityConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @MockBean
    private PasswordResetService passwordResetService;

    @Test
    void protectedRoute_withNoToken_shouldReturn401NotDefault403() throws Exception {
        mockMvc.perform(get("/api/v1/users/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("UNAUTHENTICATED"));
    }

    @Test
    void protectedRoute_withInvalidToken_shouldReturn401FromFilter() throws Exception {
        mockMvc.perform(get("/api/v1/users/me")
                .header("Authorization", "Bearer not-a-real-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("INVALID_TOKEN"));
    }

    @Test
    void passwordResetRequest_withNoToken_shouldBePermitted() throws Exception {

        String json = """
                {
                    "email": "alice@nexttrade.com"
                }
                """;

        mockMvc.perform(post("/auth/password-reset/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isOk());
    }

    @Test
    void passwordResetConfirm_withNoToken_shouldBePermitted() throws Exception {

        String json = """
                {
                    "token": "valid-reset-token",
                    "newPassword": "NewPassword123!"
                }
                """;

        mockMvc.perform(post("/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isOk());
    }
}
