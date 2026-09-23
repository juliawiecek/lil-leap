package com.neueda.leap.config;

import com.neueda.leap.security.JwtService;
import com.neueda.leap.user.UserController;
import com.neueda.leap.onboarding.controller.RegistrationController;
import com.neueda.leap.onboarding.service.RegistrationService;
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

/**
 * Verifies the security filter chain's behavior on a protected route with the
 * real filter chain active (unlike {@code UserControllerTest}, which disables
 * filters to test the controller in isolation).
 */
@WebMvcTest({UserController.class, RegistrationController.class})
@Import({SecurityConfig.class, JwtService.class})
class SecurityConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @MockBean
    private RegistrationService registrationService;

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
    void registrationRoutesPermitAnonymousRequests() throws Exception {
        for (String endpoint : new String[]{"/clients/register", "/api/v1/users"}) {
            mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(endpoint)
                    .contentType("application/json").content("{}"))
                    .andExpect(status().isBadRequest());
        }
    }
}
