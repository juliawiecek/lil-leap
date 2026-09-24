package com.neueda.leap.passwordreset;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Tests password reset REST endpoints. */
@WebMvcTest(PasswordResetController.class)
@AutoConfigureMockMvc(addFilters = false)
class PasswordResetControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private PasswordResetService passwordResetService;

    @Test
    void passwordResetEndpointsShouldNoLongerBeExposed() throws Exception {
        mockMvc.perform(post("/auth/password-reset/request"))
                .andExpect(status().isNotFound());
        mockMvc.perform(post("/auth/password-reset/confirm"))
                .andExpect(status().isNotFound());

        verifyNoInteractions(passwordResetService);
    }
}
