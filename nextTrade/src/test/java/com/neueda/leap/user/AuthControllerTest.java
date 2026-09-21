package com.neueda.leap.user;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.neueda.leap.security.JwtService;
import com.neueda.leap.user.dto.UserResponse;
import com.neueda.leap.user.exception.InvalidCredentialsException;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
@AutoConfigureMockMvc(addFilters = false)
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private UserService userService;

    @MockBean
    private JwtService jwtService;

    @Test
    void login_shouldReturn200WithTokenAndUser() throws Exception {
        UUID userId = UUID.randomUUID();
        Instant now = Instant.now();

        UserResponse user = new UserResponse(
                userId, "Julia", "Wiecek", "julia@example.com", "+18175551234", false, now, now);

        when(userService.login(any())).thenReturn(user);
        when(jwtService.issueToken(userId, "julia@example.com")).thenReturn("fake-jwt-token");

        String json = """
                {
                    "email": "julia@example.com",
                    "password": "Password123!"
                }""";

        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("fake-jwt-token"))
                .andExpect(jsonPath("$.user.id").value(userId.toString()))
                .andExpect(jsonPath("$.user.email").value("julia@example.com"))
                .andExpect(jsonPath("$.user.password").doesNotExist())
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist());

        verify(userService).login(any());
        verify(jwtService).issueToken(userId, "julia@example.com");
    }

    @Test
    void login_shouldReturn401ForInvalidCredentials() throws Exception {
        when(userService.login(any()))
                .thenThrow(new InvalidCredentialsException("Invalid email or password."));

        String json = """
                {
                    "email": "julia@example.com",
                    "password": "wrong-password"
                }""";

        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("INVALID_CREDENTIALS"))
                .andExpect(jsonPath("$.message").value("Invalid email or password."));

        verifyNoInteractions(jwtService);
    }

    @Test
    void login_shouldReturn401ForUnknownEmail_withSameGenericMessage() throws Exception {
        when(userService.login(any()))
                .thenThrow(new InvalidCredentialsException("Invalid email or password."));

        String json = """
                {
                    "email": "unknown@example.com",
                    "password": "Password123!"
                }""";

        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password."));
    }

    @Test
    void login_shouldReturn400ForBlankEmail() throws Exception {
        String json = """
                {
                    "email": "",
                    "password": "Password123!"
                }""";

        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(userService, jwtService);
    }
}
