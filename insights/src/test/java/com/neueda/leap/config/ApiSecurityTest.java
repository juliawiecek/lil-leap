package com.neueda.leap.config;

import com.neueda.leap.common.exception.GlobalExceptionHandler;
import com.neueda.leap.portfolio.controller.ClientFinancialController;
import com.neueda.leap.portfolio.service.ClientFinancialQueryService;
import com.neueda.leap.security.JwtService;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ClientFinancialController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class, GlobalExceptionHandler.class})
@ExtendWith(OutputCaptureExtension.class)
class ApiSecurityTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwtService;
    @MockBean ClientFinancialQueryService queryService;

    @Test
    void unauthorizedRequestsToProtectedRouteStillReturn401() throws Exception {
        mvc.perform(get("/holdings"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("UNAUTHENTICATED"));
        mvc.perform(get("/holdings").header("Authorization", "Bearer invalid-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("INVALID_TOKEN"));
        verifyNoInteractions(queryService);
    }

    @Test
    void unexpectedErrorsDoNotLogUnlabelledSecrets(CapturedOutput output) throws Exception {
        UUID user = UUID.randomUUID();
        when(queryService.getHoldings(any())).thenThrow(new IllegalStateException("unlabelled-password-canary"));
        mvc.perform(get("/holdings").header("Authorization", "Bearer " + jwtService.issueToken(user, "client@example.com")))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("INTERNAL_ERROR"))
                .andExpect(header().doesNotExist("Strict-Transport-Security"));
        assertThat(output.getAll()).contains("exceptionType=IllegalStateException")
                .doesNotContain("unlabelled-password-canary");
    }
}
