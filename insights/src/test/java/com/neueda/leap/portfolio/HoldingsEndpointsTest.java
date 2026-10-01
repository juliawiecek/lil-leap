package com.neueda.leap.portfolio;

import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.portfolio.controller.ClientFinancialController;
import com.neueda.leap.portfolio.service.ClientFinancialQueryService;
import com.neueda.leap.security.JwtService;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ClientFinancialController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class, ClientFinancialQueryService.class,
        HoldingsEndpointsTest.DatabaseConfiguration.class})
class HoldingsEndpointsTest {
    @TestConfiguration
    @EnableTransactionManagement
    static class DatabaseConfiguration {
        @Bean(destroyMethod = "shutdown")
        org.springframework.jdbc.datasource.embedded.EmbeddedDatabase dataSource() {
            return new EmbeddedDatabaseBuilder().generateUniqueName(true)
                    .setType(EmbeddedDatabaseType.H2)
                    .addScript("classpath:portfolio/isolation-schema.sql").build();
        }

        @Bean
        JdbcTemplate jdbcTemplate(DataSource dataSource) {
            return new JdbcTemplate(dataSource);
        }

        @Bean
        DataSourceTransactionManager transactionManager(DataSource dataSource) {
            return new DataSourceTransactionManager(dataSource);
        }
    }

    @Autowired MockMvc mvc;
    @Autowired JwtService tokens;
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSourceTransactionManager transactionManager;

    private UUID owner;
    private UUID stranger;
    private UUID account;
    private UUID secondAccount;
    private UUID instrument;
    private String bearer;

    @BeforeEach
    void seedClients() {
        jdbc.update("DELETE FROM holdings");
        jdbc.update("DELETE FROM accounts");
        jdbc.update("DELETE FROM users");
        jdbc.update("DELETE FROM instruments");
        owner = UUID.randomUUID();
        stranger = UUID.randomUUID();
        account = UUID.randomUUID();
        secondAccount = UUID.randomUUID();
        instrument = UUID.randomUUID();
        UUID otherAccount = UUID.randomUUID();
        jdbc.update("INSERT INTO users VALUES (?, ?)", owner, "owner@example.test");
        jdbc.update("INSERT INTO users VALUES (?, ?)", stranger, "other@example.test");
        jdbc.update("INSERT INTO accounts VALUES (?, ?)", account, owner);
        jdbc.update("INSERT INTO accounts VALUES (?, ?)", secondAccount, owner);
        jdbc.update("INSERT INTO accounts VALUES (?, ?)", otherAccount, stranger);
        jdbc.update("INSERT INTO instruments VALUES (?, ?, ?)", instrument, "TEST", "Test instrument");
        for (UUID id : new UUID[]{account, secondAccount, otherAccount}) {
            jdbc.update("INSERT INTO holdings VALUES (?, ?, ?, ?, ?)", id, instrument,
                    id.equals(otherAccount) ? 999 : 10, 12.5,
                    Timestamp.from(Instant.parse("2026-01-01T00:00:00Z")));
        }
        bearer = "Bearer " + tokens.issueToken(owner, "owner@example.test");
    }

    @Test
    void bothRoutesReturnOnlyJwtOwnersAccountsDespiteQuerySelectors() throws Exception {
        for (String route : routes()) {
            mvc.perform(get(route).header("Authorization", bearer)
                            .param("clientId", stranger.toString()).param("userId", stranger.toString()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2))
                    .andExpect(jsonPath("$[*].accountId", org.hamcrest.Matchers.containsInAnyOrder(
                            account.toString(), secondAccount.toString())))
                    .andExpect(jsonPath("$[0].instrumentId").value(instrument.toString()))
                    .andExpect(jsonPath("$[0].symbol").value("TEST"))
                    .andExpect(jsonPath("$[0].instrumentName").value("Test instrument"))
                    .andExpect(jsonPath("$[0].quantity").value(10))
                    .andExpect(jsonPath("$[0].averageCost").value(12.5));
        }
    }

    @Test
    void anotherOrUnknownClientIsDenied() throws Exception {
        for (UUID id : new UUID[]{stranger, UUID.randomUUID()}) {
            mvc.perform(get("/api/v1/clients/{id}/holdings", id).header("Authorization", bearer))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$[*].accountId").doesNotExist());
        }
    }

    @Test
    void bothRoutesRequireValidJwt() throws Exception {
        for (String route : routes()) {
            mvc.perform(get(route)).andExpect(status().isUnauthorized());
            mvc.perform(get(route).header("Authorization", "Bearer invalid"))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Test
    void noHoldingsReturnsEmptyArray() throws Exception {
        jdbc.update("DELETE FROM holdings WHERE account_id IN (?, ?)", account, secondAccount);
        for (String route : routes()) {
            mvc.perform(get(route).header("Authorization", bearer))
                    .andExpect(status().isOk()).andExpect(content().json("[]"));
        }
    }

    @Test
    void nextReadReflectsCommittedHoldingsUpdate() throws Exception {
        bothRoutesReturnOnlyJwtOwnersAccountsDespiteQuerySelectors();
        Instant settledAt = Instant.parse("2026-02-01T12:00:00Z");
        // Exercise the committed database boundary without mocking the read service.
        // HoldingsSettlementPostgresTest verifies the production settlement trigger.
        new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                jdbc.update("UPDATE holdings SET quantity = ?, avg_cost = ?, updated_at = ? WHERE account_id = ?",
                        15, 14.25, Timestamp.from(settledAt), account));
        for (String route : routes()) {
            String holding = "$[?(@.accountId == '" + account + "')]";
            mvc.perform(get(route).header("Authorization", bearer))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath(holding + ".quantity").value(org.hamcrest.Matchers.contains(15)))
                    .andExpect(jsonPath(holding + ".averageCost").value(org.hamcrest.Matchers.contains(14.25)))
                    .andExpect(jsonPath(holding + ".updatedAt").value(org.hamcrest.Matchers.contains(settledAt.toString())));
        }
    }

    private String[] routes() {
        return new String[]{"/api/v1/holdings", "/api/v1/clients/" + owner + "/holdings"};
    }
}
