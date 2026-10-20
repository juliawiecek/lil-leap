package com.neueda.leap.reporting;

import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.test.web.servlet.MockMvc;
import java.util.Map;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ReportingController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class})
class ReportingBoundaryTest {
    @Autowired MockMvc mvc;
    @Autowired JwtServiceImpl tokens;
    @MockBean ReportingQueryService reports;

    private String token(String role) { return "Bearer " + tokens.issueToken(UUID.randomUUID(), "test@example.test", role); }

    @Test
    void analystsAndOperationsStaffCanReadReports() throws Exception {
        when(reports.summary()).thenReturn(Map.of("fills", 2));
        mvc.perform(get("/reports/summary")).andExpect(status().isUnauthorized());
        mvc.perform(get("/reports/summary").header("Authorization", token("TRADER"))).andExpect(status().isForbidden());
        for (String role : new String[]{"ANALYST", "OPERATIONS"}) {
            mvc.perform(get("/reports/summary").header("Authorization", token(role)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.fills").value(2));
        }
    }

    @Test
    void onlyOperationsStaffCanReachTradeInvestigation() throws Exception {
        String route = "/trades/" + UUID.randomUUID() + "/timeline";
        mvc.perform(get(route)).andExpect(status().isUnauthorized());
        mvc.perform(get(route).header("Authorization", token("TRADER"))).andExpect(status().isForbidden());
        mvc.perform(get(route).header("Authorization", token("ANALYST"))).andExpect(status().isForbidden());
        int operations = mvc.perform(get(route).header("Authorization", token("OPERATIONS"))).andReturn().getResponse().getStatus();
        assertThat(operations).as("security lets operations staff through to the trade routes").isNotIn(401, 403);
        mvc.perform(post(route).header("Authorization", token("OPERATIONS"))).andExpect(status().isForbidden());
    }

    @Test
    void reportingCannotSubmitOrdersOrExposeTransactionalEndpoints() throws Exception {
        for (String route : new String[]{"/orders", "/holdings", "/cash", "/users", "/instruments"}) {
            mvc.perform(get(route).header("Authorization", token("ANALYST"))).andExpect(status().isForbidden());
            mvc.perform(post(route).header("Authorization", token("ANALYST"))).andExpect(status().isForbidden());
        }
        mvc.perform(post("/reports/summary").header("Authorization", token("ANALYST"))).andExpect(status().isForbidden());
    }

    @Test
    void reportReadsDoNotRequireCsrfOrCreateSession() throws Exception {
        when(reports.summary()).thenReturn(Map.of("fills", 2));
        var result = mvc.perform(get("/reports/summary").header("Authorization", token("ANALYST")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fills").value(2))
                .andReturn();
        assertThat(result.getRequest().getSession(false)).isNull();
    }

    @Test
    void unsafeRequestsWithoutCsrfAreRejectedBeforeJwtAuthentication() throws Exception {
        for (HttpMethod method : new HttpMethod[]{HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE}) {
            // An invalid bearer would return 401 if the CSRF filter were disabled or bypassed.
            mvc.perform(request(method, "/reports/summary").header("Authorization", "Bearer invalid-token"))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error").value("ACCESS_DENIED"));
        }
        verifyNoInteractions(reports);
    }

    @Test
    void validCsrfDoesNotBypassAuthenticationOrReadOnlyAuthorization() throws Exception {
        var request = mvc.perform(get("/reports/summary"))
                .andExpect(status().isUnauthorized()).andReturn().getRequest();
        var csrf = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        String csrfValue = csrf.getToken();
        var session = (MockHttpSession) request.getSession(false);

        mvc.perform(post("/reports/summary").session(session)
                        .param(csrf.getParameterName(), csrfValue)
                        .header("Authorization", "Bearer invalid-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("INVALID_TOKEN"));
        mvc.perform(post("/reports/summary").session(session)
                        .param(csrf.getParameterName(), csrfValue)
                        .header("Authorization", token("ANALYST")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("ACCESS_DENIED"));
        verifyNoInteractions(reports);
    }
}
