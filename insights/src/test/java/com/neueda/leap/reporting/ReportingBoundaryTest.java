package com.neueda.leap.reporting;

import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import java.util.Map;
import java.util.UUID;
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
    void onlyAnalystsCanReadReports() throws Exception {
        when(reports.summary()).thenReturn(Map.of("fills", 2));
        mvc.perform(get("/reports/summary")).andExpect(status().isUnauthorized());
        mvc.perform(get("/reports/summary").header("Authorization", token("TRADER"))).andExpect(status().isForbidden());
        mvc.perform(get("/reports/summary").header("Authorization", token("ANALYST")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.fills").value(2));
    }

    @Test
    void reportingCannotSubmitOrdersOrExposeTransactionalEndpoints() throws Exception {
        for (String route : new String[]{"/orders", "/holdings", "/cash", "/users", "/instruments"}) {
            mvc.perform(get(route).header("Authorization", token("ANALYST"))).andExpect(status().isForbidden());
            mvc.perform(post(route).header("Authorization", token("ANALYST"))).andExpect(status().isForbidden());
        }
        mvc.perform(post("/reports/summary").header("Authorization", token("ANALYST"))).andExpect(status().isForbidden());
    }
}
