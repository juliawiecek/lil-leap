package com.neueda.leap.config;

import com.neueda.leap.onboarding.controller.RegistrationController;
import com.neueda.leap.onboarding.service.RegistrationService;
import com.neueda.leap.security.JwtService;
import com.neueda.leap.user.AuthController;
import com.neueda.leap.user.UserController;
import com.neueda.leap.user.UserService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest({AuthController.class, RegistrationController.class, UserController.class})
@Import(SecurityConfig.class)
@ExtendWith(OutputCaptureExtension.class)
class ApiSecurityTest {
    @Autowired MockMvc mvc;
    @MockBean JwtService jwtService;
    @MockBean UserService users;
    @MockBean RegistrationService registration;

    @Test
    void frameworkErrorsKeepTheirHttpStatus() throws Exception {
        mvc.perform(get("/auth/login"))
                .andExpect(status().isMethodNotAllowed());
        mvc.perform(post("/auth/login").contentType("text/plain").content("private-input"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.message").value("The request could not be completed."));
    }

    @Test
    void unexpectedErrorsDoNotLogUnlabelledSecrets(CapturedOutput output) throws Exception {
        when(users.login(any())).thenThrow(new IllegalStateException("unlabelled-password-canary"));
        mvc.perform(post("/auth/login").contentType("application/json")
                        .content("{\"email\":\"client@example.com\",\"password\":\"request-password-canary\"}"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("INTERNAL_ERROR"))
                .andExpect(header().doesNotExist("Strict-Transport-Security"));
        assertThat(output.getAll()).contains("exceptionType=IllegalStateException")
                .doesNotContain("unlabelled-password-canary", "request-password-canary");
    }

    @Test
    void validationAndParsingErrorsDoNotExposeRejectedPasswordsOrSsn(CapturedOutput output) throws Exception {
        String password = "secret!"; // Fails the registration minimum length.
        String ssn = "private-ssn-marker";
        mvc.perform(post("/users").contentType("application/json")
                        .content("{\"password\":\"" + password + "\",\"ssn\":\"" + ssn + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_REQUEST"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().string("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"))
                .andExpect(header().string("Permissions-Policy", "camera=(), microphone=(), geolocation=()"))
                .andExpect(header().string("Cache-Control", "no-cache, no-store, max-age=0, must-revalidate"));
        mvc.perform(post("/auth/login").contentType("application/json")
                        .content("{\"password\":\"malformed-secret-marker\", bad-json}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"INVALID_REQUEST\",\"message\":\"The request contains invalid or missing fields.\"}"));
        assertThat(output.getAll()).doesNotContain(password, ssn, "malformed-secret-marker");
        verifyNoInteractions(jwtService, users, registration);
    }
}
