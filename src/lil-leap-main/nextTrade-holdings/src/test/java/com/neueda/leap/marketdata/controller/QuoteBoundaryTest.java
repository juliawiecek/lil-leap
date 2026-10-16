package com.neueda.leap.marketdata.controller;

import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.marketdata.QuoteRepository;
import com.neueda.leap.security.JwtService;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import java.util.UUID;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.mockito.Mockito.verifyNoInteractions;

@WebMvcTest(QuoteController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class})
class QuoteBoundaryTest {
    @Autowired MockMvc mvc;
    @Autowired JwtServiceImpl tokens;
    @MockBean QuoteRepository repository;

    @Test
    void missingOrInvalidTokenNeverQueriesQuotes() throws Exception {
        mvc.perform(get("/quotes/history/{id}", UUID.randomUUID())).andExpect(status().isUnauthorized());
        mvc.perform(get("/quotes/history/{id}", UUID.randomUUID()).header("Authorization", "Bearer invalid"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(repository);
    }

    @Test
    void authenticatedDisplayQueriesReachTheirHoldingsController() throws Exception {
        for (String role : new String[]{"TRADER", "ANALYST"}) {
            String token = "Bearer " + tokens.issueToken(UUID.randomUUID(), "test@example.test", role);
            mvc.perform(get("/quotes/history/{id}", UUID.randomUUID()).header("Authorization", token))
                    .andExpect(status().isNotFound());
            mvc.perform(get("/quotes/latest/by-instrument/bad-id").header("Authorization", token))
                    .andExpect(status().isBadRequest());
        }
    }
}
