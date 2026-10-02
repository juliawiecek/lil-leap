package com.neueda.leap.order.submission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.instrument.repository.JdbcInstrumentRepository;
import com.neueda.leap.instrument.service.InstrumentService;
import com.neueda.leap.marketdata.JdbcQuoteRepository;
import com.neueda.leap.order.service.OrderSufficiencyService;
import com.neueda.leap.order.submission.controller.OrderSubmissionController;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.JdbcOrderSubmissionRepository;
import com.neueda.leap.order.submission.repository.JdbcOrderSufficiencyRepository;
import com.neueda.leap.order.submission.service.OrderSubmissionService;
import com.neueda.leap.security.JwtService;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real security, catalog, submission rules and JDBC; every run owns an isolated schema. */
@WebMvcTest(OrderSubmissionController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class, InstrumentService.class,
        JdbcInstrumentRepository.class, OrderSubmissionService.class, JdbcOrderSubmissionRepository.class,
        OrderSufficiencyService.class, JdbcOrderSufficiencyRepository.class, JdbcQuoteRepository.class,
        InstrumentTradabilitySubmissionTest.Database.class})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class InstrumentTradabilitySubmissionTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtService tokens;
    @Autowired JdbcTemplate jdbc;
    @Autowired InstrumentService instruments;
    @Autowired DataSource dataSource;
    private final UUID user = UUID.randomUUID(), account = UUID.randomUUID(), instrument = UUID.randomUUID();
    private String authorization;

    @BeforeEach
    void seed() {
        for (String table : new String[]{"order_status_history", "fills", "orders", "holdings", "cash_balances", "quotes", "accounts", "instruments"}) {
            jdbc.update("DELETE FROM " + table);
        }
        jdbc.update("INSERT INTO accounts VALUES (?, ?, 'ACTIVE', TRUE, 'NOVICE', 0, 2)", account, user);
        jdbc.update("INSERT INTO instruments VALUES (?, 'AAPL', 'Apple Inc.', 'COMMON_STOCK', 'NASDAQ', 'USD', 'Technology', TRUE, TRUE)", instrument);
        jdbc.update("INSERT INTO cash_balances VALUES (?, 'USD', 10000)", account);
        jdbc.update("INSERT INTO holdings VALUES (?, ?, 100)", account, instrument);
        jdbc.update("INSERT INTO quotes VALUES (?, ?, 99, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'TEST', TRUE)", UUID.randomUUID(), instrument);
        authorization = "Bearer " + tokens.issueToken(user, "trader@example.test");
    }

    @ParameterizedTest
    @CsvSource({"BUY,false,true,INSTRUMENT_DISABLED", "SELL,false,true,INSTRUMENT_DISABLED",
            "BUY,true,false,INSTRUMENT_NOT_TRADABLE", "SELL,true,false,INSTRUMENT_NOT_TRADABLE",
            "BUY,false,false,INSTRUMENT_DISABLED", "SELL,false,false,INSTRUMENT_DISABLED"})
    void rejectsCurrentFlagsEvenAfterTradableCatalogRead(String side, boolean enabled, boolean tradable,
                                                       String reason) throws Exception {
        assertThat(instruments.getInstrument(instrument).tradable()).isTrue();
        jdbc.update("UPDATE instruments SET enabled = ?, tradable = ? WHERE instrument_id = ?", enabled, tradable, instrument);

        submit(request(side, UUID.randomUUID())).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value(reason));

        assertNoTradeEffects(0);
    }

    @Test
    void tradabilityRejectionPrecedesMissingQuote() throws Exception {
        jdbc.update("DELETE FROM quotes");
        jdbc.update("UPDATE instruments SET tradable = FALSE WHERE instrument_id = ?", instrument);
        submit(request("BUY", UUID.randomUUID())).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("INSTRUMENT_NOT_TRADABLE"))
                .andExpect(jsonPath("$.message").value("The requested instrument is halted or restricted."));
        assertNoTradeEffects(0);
    }

    @Test
    void unsupportedSymbolIsRejected() throws Exception {
        var request = new SubmitOrderRequest(account, "UNKNOWN", UUID.randomUUID(), "BUY", 1, "MARKET", null);
        submit(request).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("INSTRUMENT_UNSUPPORTED"));
        assertNoTradeEffects(0);
    }

    @Test
    void ownershipIsCheckedBeforeInstrumentState() throws Exception {
        jdbc.update("UPDATE accounts SET user_id = ?", UUID.randomUUID());
        jdbc.update("UPDATE instruments SET tradable = FALSE");
        submit(request("BUY", UUID.randomUUID())).andExpect(status().isNotFound());
        assertNoTradeEffects(0);
    }

    @Test
    void retryReturnsOriginalOrderAfterInstrumentIsDisabled() throws Exception {
        UUID reference = UUID.randomUUID(), order = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO orders(order_id, account_id, instrument_id, client_reference, side, quantity, order_type, status)
                VALUES (?, ?, ?, ?, 'BUY', 1, 'MARKET', 'SUBMITTED')
                """, order, account, instrument, reference);
        jdbc.update("UPDATE instruments SET enabled = FALSE, tradable = FALSE WHERE instrument_id = ?", instrument);
        submit(request("BUY", reference)).andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value(order.toString()));
        submit(request("BUY", UUID.randomUUID())).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("INSTRUMENT_DISABLED"));
        assertNoTradeEffects(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"BUY", "SELL"})
    @EnabledIfEnvironmentVariable(named = "TEST_POSTGRES_URL", matches = ".+")
    void reenabledInstrumentCanBeSubmittedAndRetriedOnPostgres(String side) throws Exception {
        UUID reference = UUID.randomUUID();
        jdbc.update("UPDATE instruments SET tradable = FALSE");
        submit(request(side, reference)).andExpect(status().isUnprocessableEntity());
        jdbc.update("UPDATE instruments SET tradable = TRUE");
        String body = submit(request(side, reference)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SUBMITTED")).andReturn().getResponse().getContentAsString();
        String orderId = json.readTree(body).get("orderId").asText();
        submit(request(side, reference)).andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value(orderId));
        assertNoTradeEffects(1);
    }

    private SubmitOrderRequest request(String side, UUID reference) {
        return new SubmitOrderRequest(account, "aapl", reference, side, 1, "MARKET", null);
    }

    private ResultActions submit(SubmitOrderRequest request) throws Exception {
        return mvc.perform(post("/orders").header("Authorization", authorization)
                .contentType("application/json").content(json.writeValueAsBytes(request)));
    }

    private void assertNoTradeEffects(int orderCount) {
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM orders", Integer.class)).isEqualTo(orderCount);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM fills", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances WHERE account_id = ?", java.math.BigDecimal.class, account))
                .isEqualByComparingTo("10000");
        assertThat(jdbc.queryForObject("SELECT quantity FROM holdings WHERE account_id = ?", Long.class, account)).isEqualTo(100);
    }

    @AfterAll
    void removeTestSchema() throws Exception {
        try (var connection = dataSource.getConnection()) {
            String schema = connection.getSchema();
            assertThat(schema).matches("(?i)ts066_[a-f0-9]+");
            jdbc.execute("DROP SCHEMA " + schema + " CASCADE");
        }
    }

    @TestConfiguration
    @EnableTransactionManagement
    static class Database {
        @Bean
        DataSource dataSource() {
            String url = System.getenv("TEST_POSTGRES_URL");
            boolean postgres = url != null && !url.isBlank();
            var source = new DriverManagerDataSource(postgres ? url :
                    "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
                    postgres ? System.getenv("TEST_POSTGRES_USER") : "sa",
                    postgres ? System.getenv("TEST_POSTGRES_PASSWORD") : "");
            String schema = "ts066_" + UUID.randomUUID().toString().replace("-", "");
            // Only this generated schema is touched, including when PostgreSQL is supplied.
            new JdbcTemplate(source).execute("CREATE SCHEMA " + schema);
            source.setSchema(postgres ? schema : schema.toUpperCase(java.util.Locale.ROOT));
            new ResourceDatabasePopulator(new ClassPathResource("order/submission-schema.sql")).execute(source);
            return source;
        }

        @Bean JdbcTemplate jdbcTemplate(DataSource source) { return new JdbcTemplate(source); }
        @Bean DataSourceTransactionManager transactionManager(DataSource source) {
            return new DataSourceTransactionManager(source);
        }
    }
}
