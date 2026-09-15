package com.neueda.leap.user;

import com.neueda.leap.security.JwtPrincipal;
import com.neueda.leap.user.dto.UserResponse;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;

import org.springframework.boot.test.mock.mockito.MockBean;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.*;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(UserController.class)
@AutoConfigureMockMvc(addFilters = false)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;


    @Test
    void me_shouldReturnAuthenticatedUsersData() throws Exception {
        UUID userId = UUID.randomUUID();
        Instant now = Instant.now();

        UserResponse response = new UserResponse(
                userId,
                "Julia",
                "Wiecek",
                "julia@example.com",
                "+18175551234",
                false,
                now,
                now);

        when(userService.getById(userId)).thenReturn(response);

        mockMvc.perform(get("/users/me")
                .principal(new UsernamePasswordAuthenticationToken(
                        new JwtPrincipal(userId, "julia@example.com"), null, List.of())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(userId.toString()))
                .andExpect(jsonPath("$.email").value("julia@example.com"));

        verify(userService).getById(userId);
    }
}
