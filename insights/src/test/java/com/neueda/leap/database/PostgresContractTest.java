package com.neueda.leap.database;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.neueda.leap.onboarding.enums.NetWorthBracket;
import com.neueda.leap.onboarding.repository.FinancialProfileRepository;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.JdbcOrderSubmissionRepository;
import com.neueda.leap.order.submission.service.OrderSubmissionService;
import com.neueda.leap.security.JwtService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Run against a disposable database initialized with db/finalized-schema.sql and the app role. */
@SpringBootTest(properties = {"spring.jpa.hibernate.ddl-auto=validate",
        "nexttrade.security.ssn-encryption-key=synthetic-contract-test-key"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "TEST_POSTGRES_URL", matches = ".+")
@Transactional
class PostgresContractTest {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", () -> System.getenv("TEST_POSTGRES_URL"));
        properties.add("spring.datasource.username", () -> System.getenv("TEST_POSTGRES_USER"));
        properties.add("spring.datasource.password", () -> System.getenv("TEST_POSTGRES_PASSWORD"));
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager entityManager;
    @Autowired FinancialProfileRepository profiles;
    @Autowired JwtService tokens;
    @Autowired OrderSubmissionService orders;
    @SpyBean JdbcOrderSubmissionRepository repository;

    @ParameterizedTest
    @EnumSource(NetWorthBracket.class)
    void registrationPersistsDatabaseBracketAndJsonObjects(NetWorthBracket bracket) throws Exception {
        ObjectNode body = (ObjectNode) json.readTree(getClass().getResourceAsStream("/registration.json"));
        body.put("email", UUID.randomUUID() + "@example.test");
        body.put("net_worth_bracket", bracket.value());
        body.put("broker_firm_name", "Synthetic \"firm\"\nline\tend");
        String response = mvc.perform(post("/api/v1/users").contextPath("/api/v1")
                        .contentType("application/json").content(json.writeValueAsBytes(body)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        entityManager.flush();
        entityManager.clear();
        UUID user = UUID.fromString(json.readTree(response).get("id").asText());
        assertThat(jdbc.queryForObject("SELECT net_worth_bracket FROM financial_profiles WHERE user_id = ?",
                String.class, user)).isEqualTo(bracket.value());
        assertThat(jdbc.queryForObject("SELECT jsonb_typeof(regulatory_disclosures) FROM financial_profiles WHERE user_id = ?",
                String.class, user)).isEqualTo("object");
        assertThat(jdbc.queryForObject("SELECT regulatory_disclosures->>'brokerFirmName' FROM financial_profiles WHERE user_id = ?",
                String.class, user)).isEqualTo(body.get("broker_firm_name").asText());
        assertThat(profiles.findAll().stream().filter(p -> p.getUser().getUserId().equals(user)).findFirst().orElseThrow()
                .getNetWorthBracket()).isEqualTo(bracket);
    }

    @Test
    void ownerCanSubmitAndRetryButOtherClientsCannotWrite() throws Exception {
        UUID user = createUser();
        UUID account = createAccount(user);
        UUID instrument = createInstrument();
        fundAccount(account, "1020.00");
        quote(instrument);
        var request = new SubmitOrderRequest(account, "CONTRACT", UUID.randomUUID(), "BUY", 10, "MARKET", null);
        byte[] body = json.writeValueAsBytes(request);
        String ownToken = tokens.issueToken(user, user + "@example.test");
        String first = mvc.perform(post("/api/v1/orders").contextPath("/api/v1")
                        .header("Authorization", "Bearer " + ownToken).contentType("application/json").content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("SUBMITTED"))
                .andReturn().getResponse().getContentAsString();
        mvc.perform(post("/api/v1/orders").contextPath("/api/v1")
                        .header("Authorization", "Bearer " + ownToken).contentType("application/json").content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.orderId").value(json.readTree(first).get("orderId").asText()));
        for (UUID target : new UUID[]{account, UUID.randomUUID()}) {
            var foreign = new SubmitOrderRequest(target, "CONTRACT", UUID.randomUUID(), "BUY", 10, "MARKET", null);
            mvc.perform(post("/api/v1/orders").contextPath("/api/v1")
                            .header("Authorization", "Bearer " + tokens.issueToken(UUID.randomUUID(), "other@example.test"))
                            .contentType("application/json").content(json.writeValueAsBytes(foreign)))
                    .andExpect(status().isNotFound());
        }
        mvc.perform(post("/api/v1/orders").contextPath("/api/v1")
                        .header("Authorization", "Bearer " + ownToken).param("userId", UUID.randomUUID().toString())
                        .contentType("application/json").content(body)).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM orders WHERE account_id = ?", Integer.class, account)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM fills JOIN orders USING (order_id) WHERE account_id = ?",
                Integer.class, account)).isZero();
    }

    @Test
    void concurrentRetriesCommitExactlyOneOrder() throws Exception {
        UUID user = createUser();
        UUID account = createAccount(user);
        UUID instrument = createInstrument();
        fundAccount(account, "1020.00");
        quote(instrument);
        TestTransaction.flagForCommit();
        TestTransaction.end();
        var request = new SubmitOrderRequest(account, "CONTRACT", UUID.randomUUID(), "BUY", 10, "MARKET", null);
        var barrier = new CyclicBarrier(2);
        doAnswer(invocation -> {
            Object existing = invocation.callRealMethod();
            if (((java.util.Optional<?>) existing).isEmpty()) {
                barrier.await(10, TimeUnit.SECONDS);
            }
            return existing;
        }).when(repository).findByAccountAndClientReference(account, request.clientReference());
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> orders.submit(user, request));
            var second = executor.submit(() -> orders.submit(user, request));
            var a = first.get(20, TimeUnit.SECONDS);
            var b = second.get(20, TimeUnit.SECONDS);
            assertThat(a.order().orderId()).isEqualTo(b.order().orderId());
            assertThat(a.created()).isNotEqualTo(b.created());
            assertThat(jdbc.queryForObject("SELECT count(*) FROM orders WHERE account_id = ?", Integer.class, account)).isEqualTo(1);
        } finally {
            executor.shutdown();
            jdbc.update("DELETE FROM orders WHERE account_id = ?", account);
            jdbc.update("DELETE FROM cash_balances WHERE account_id = ?", account);
            jdbc.update("DELETE FROM quotes WHERE instrument_id = ?", instrument);
            jdbc.update("DELETE FROM accounts WHERE account_id = ?", account);
            jdbc.update("DELETE FROM users WHERE user_id = ?", user);
            jdbc.update("DELETE FROM instruments WHERE instrument_id = ?", instrument);
        }
    }

    @ParameterizedTest
    @CsvSource({"BUY,1019.99,10,INSUFFICIENT_CASH", "SELL,100000,9,INSUFFICIENT_HOLDINGS"})
    void insufficientOrdersAreRejectedBeforePersistence(String side, String cash, long owned, String reason) throws Exception {
        UUID user = createUser();
        UUID account = createAccount(user);
        UUID instrument = createInstrument();
        fundAccount(account, cash);
        quote(instrument);
        jdbc.update("INSERT INTO holdings(account_id, instrument_id, quantity) VALUES (?, ?, ?)", account, instrument, owned);
        // Neither another account owned by this user nor a foreign account can supply resources.
        for (UUID owner : new UUID[]{user, createUser()}) {
            UUID otherAccount = createAccount(owner);
            fundAccount(otherAccount, "100000.00");
            jdbc.update("INSERT INTO holdings(account_id, instrument_id, quantity) VALUES (?, ?, 1000)", otherAccount, instrument);
        }
        var balancesBefore = jdbc.queryForList("SELECT * FROM cash_balances ORDER BY account_id");
        var holdingsBefore = jdbc.queryForList("SELECT * FROM holdings ORDER BY account_id, instrument_id");

        submit(user, account, side).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value(reason));

        assertThat(jdbc.queryForObject("SELECT count(*) FROM orders WHERE account_id = ?", Integer.class, account)).isZero();
        assertThat(jdbc.queryForList("SELECT * FROM cash_balances ORDER BY account_id")).isEqualTo(balancesBefore);
        assertThat(jdbc.queryForList("SELECT * FROM holdings ORDER BY account_id, instrument_id")).isEqualTo(holdingsBefore);
    }

    @ParameterizedTest
    @CsvSource({"BUY,INSUFFICIENT_CASH", "SELL,INSUFFICIENT_HOLDINGS"})
    void missingBalancesAreTreatedAsZero(String side, String reason) throws Exception {
        UUID user = createUser();
        UUID account = createAccount(user);
        quote(createInstrument());
        submit(user, account, side).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value(reason));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM orders WHERE account_id = ?", Integer.class, account)).isZero();
    }

    @Test
    void buyWithoutQuoteIsRejectedButExactHoldingSellSucceeds() throws Exception {
        UUID user = createUser();
        UUID account = createAccount(user);
        UUID instrument = createInstrument();
        fundAccount(account, "100000.00");
        submit(user, account, "BUY").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("QUOTE_UNAVAILABLE"));
        jdbc.update("INSERT INTO holdings(account_id, instrument_id, quantity) VALUES (?, ?, 10)", account, instrument);
        submit(user, account, "SELL").andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SUBMITTED"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM orders WHERE account_id = ?", Integer.class, account)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT quantity FROM holdings WHERE account_id = ? AND instrument_id = ?",
                Long.class, account, instrument)).isEqualTo(10L);
    }

    @Test
    void retryReturnsOriginalOrderEvenAfterCashAndQuoteAreRemoved() throws Exception {
        UUID user = createUser();
        UUID account = createAccount(user);
        UUID instrument = createInstrument();
        fundAccount(account, "1020.00");
        quote(instrument);
        var request = new SubmitOrderRequest(account, "CONTRACT", UUID.randomUUID(), "BUY", 10, "MARKET", null);
        var original = orders.submit(user, request);
        jdbc.update("DELETE FROM cash_balances WHERE account_id = ?", account);
        jdbc.update("DELETE FROM quotes WHERE instrument_id = ?", instrument);
        var retry = orders.submit(user, request);
        assertThat(retry.created()).isFalse();
        assertThat(retry.order().orderId()).isEqualTo(original.order().orderId());
    }

    @Test
    void latestAskDeterminesBuyingPower() throws Exception {
        UUID user = createUser();
        UUID account = createAccount(user);
        UUID instrument = createInstrument();
        fundAccount(account, "1020.00");
        quote(instrument);
        jdbc.update("INSERT INTO quotes(instrument_id, bid, ask, quoted_at, source) VALUES (?, 99, 101, CURRENT_TIMESTAMP + INTERVAL '1 second', 'TEST')", instrument);
        submit(user, account, "BUY").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("INSUFFICIENT_CASH"));
    }

    private org.springframework.test.web.servlet.ResultActions submit(UUID user, UUID account, String side) throws Exception {
        var request = new SubmitOrderRequest(account, "CONTRACT", UUID.randomUUID(), side, 10, "MARKET", null);
        return mvc.perform(post("/api/v1/orders").contextPath("/api/v1")
                .header("Authorization", "Bearer " + tokens.issueToken(user, user + "@example.test"))
                .contentType("application/json").content(json.writeValueAsBytes(request)));
    }

    private void fundAccount(UUID account, String cash) {
        jdbc.update("INSERT INTO cash_balances(account_id, balance) VALUES (?, ?)", account, new java.math.BigDecimal(cash));
    }

    private void quote(UUID instrument) {
        jdbc.update("INSERT INTO quotes(instrument_id, bid, ask, quoted_at, source) VALUES (?, 99, 100, CURRENT_TIMESTAMP, 'TEST')", instrument);
    }

    private UUID createUser() {
        return jdbc.queryForObject("INSERT INTO users(email, password_hash) VALUES (?, 'synthetic-hash') RETURNING user_id",
                UUID.class, UUID.randomUUID() + "@example.test");
    }

    private UUID createAccount(UUID user) {
        return jdbc.queryForObject("INSERT INTO accounts(user_id, account_number, account_name) VALUES (?, ?, 'Contract test') RETURNING account_id",
                UUID.class, user, UUID.randomUUID().toString().substring(0, 20));
    }

    private UUID createInstrument() {
        return jdbc.queryForObject("INSERT INTO instruments(symbol, instrument_name, asset_class, market_code) VALUES ('CONTRACT', 'Contract test', 'COMMON_STOCK', 'TEST') RETURNING instrument_id",
                UUID.class);
    }
}
