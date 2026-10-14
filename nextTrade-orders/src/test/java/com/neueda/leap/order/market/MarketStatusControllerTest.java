package com.neueda.leap.order.market;

import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Set;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(MarketStatusController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class, MarketStatusControllerTest.FixedMarket.class})
class MarketStatusControllerTest {
    @Autowired MockMvc mvc;
    @Autowired JwtServiceImpl tokens;

    @TestConfiguration
    static class FixedMarket {
        @Bean
        Clock clock() {
            return Clock.fixed(Instant.parse("2026-10-14T14:00:00Z"), ZoneOffset.UTC);
        }

        @Bean
        MarketHours marketHours() {
            return new MarketHours(ZoneId.of("America/New_York"), LocalTime.of(9, 30), LocalTime.of(16, 0), Set.of(), true);
        }
    }

    @Test
    void anySignedInUserSeesWhetherTheMarketIsOpen() throws Exception {
        for (String role : new String[]{"TRADER", "ANALYST"}) {
            mvc.perform(get("/market/status").header("Authorization",
                            "Bearer " + tokens.issueToken(UUID.randomUUID(), "user@example.test", role)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.open").value(true))
                    .andExpect(jsonPath("$.exchangeTimeZone").value("America/New_York"))
                    .andExpect(jsonPath("$.nextOpen").value("2026-10-15T13:30:00Z"))
                    .andExpect(jsonPath("$.nextClose").value("2026-10-14T20:00:00Z"));
        }
    }

    @Test
    void requiresSignIn() throws Exception {
        mvc.perform(get("/market/status")).andExpect(status().isUnauthorized());
    }
}
