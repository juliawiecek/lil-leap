package com.neueda.leap.user;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.security.JwtService;
import com.neueda.leap.user.dto.UserResponse;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end coverage of the login -&gt; protected-route flow.
 *
 * <p>Unlike {@link AuthControllerTest} and the {@code /me} test in
 * {@link UserControllerTest}, this test does not mint or inject a token
 * directly: it enables the real security filter chain ({@link SecurityConfig})
 * and a real {@link JwtService}, so the token used to call {@code /me} is
 * exactly the one {@code /auth/login} actually returned.</p>
 */
@WebMvcTest(controllers = {AuthController.class, UserController.class})
@Import({SecurityConfig.class, JwtService.class})
class AuthenticationFlowTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private UserService userService;

    @Test
    void login_thenMe_shouldReturnAuthenticatedUsersData() throws Exception {
        UUID userId = UUID.randomUUID();
        Instant now = Instant.now();

        UserResponse user = new UserResponse(
                userId, "Julia", "Wiecek", "julia@example.com", "+18175551234", false, now, now);

        when(userService.login(any())).thenReturn(user);
        when(userService.getById(userId)).thenReturn(user);

        String loginJson = """
                {
                    "email": "julia@example.com",
                    "password": "Password123!"
                }""";

        MvcResult loginResult = mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON).content(loginJson))
                .andExpect(status().isOk())
                .andReturn();

        String token = objectMapper.readTree(loginResult.getResponse().getContentAsString())
                .get("token").asText();

        mockMvc.perform(get("/api/v1/users/me")
                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(userId.toString()))
                .andExpect(jsonPath("$.email").value("julia@example.com"));
    }

    // Negative cases (no token / invalid token against a protected route) are
    // covered by SecurityConfigTest; this class exists specifically to prove
    // a token minted by the real login endpoint is accepted by the real filter.
}
