package com.neueda.leap.portfolio;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.neueda.leap.common.exception.GlobalExceptionHandler;
import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.portfolio.controller.ClientFinancialController;
import com.neueda.leap.portfolio.service.ClientFinancialQueryService;
import com.neueda.leap.security.JwtService;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.data.jpa.JpaRepositoriesAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real HTTP security chain, signed JWTs, controller, service and SQL; no mocked authorization/data. */
@SpringBootTest(classes = CrossClientAccessIntegrationTest.TestApplication.class, properties = {
        "spring.datasource.url=jdbc:h2:mem:cross-client;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa", "spring.datasource.password=",
        "spring.sql.init.mode=always",
        "spring.sql.init.schema-locations=classpath:portfolio/isolation-schema.sql"
})
@AutoConfigureMockMvc
@Transactional
class CrossClientAccessIntegrationTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = {HibernateJpaAutoConfiguration.class, JpaRepositoriesAutoConfiguration.class,
            UserDetailsServiceAutoConfiguration.class})
    @Import({SecurityConfig.class, JwtServiceImpl.class, ClientFinancialController.class,
            ClientFinancialQueryService.class, GlobalExceptionHandler.class})
    static class TestApplication { }

    private static final String API = "/api/v1";
    private static final List<String> COLLECTIONS = List.of("/holdings", "/cash", "/orders");
    private static final List<String> SELECTORS = List.of("userId", "user_id", "clientId", "client_id",
            "accountId", "account_id", "orderId", "order_id");
    private static final UUID ALICE = new UUID(0, 1);
    private static final UUID BOB = new UUID(0, 2);
    private static final UUID EMPTY_CLIENT = new UUID(0, 3);
    private static final UUID INSTRUMENT = new UUID(0, 10);
    private static final Map<UUID, List<UUID>> ACCOUNTS = Map.of(
            ALICE, List.of(new UUID(0, 11), new UUID(0, 12)),
            BOB, List.of(new UUID(0, 21), new UUID(0, 22)), EMPTY_CLIENT, List.of());

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtService tokens;
    @Autowired ObjectMapper json;

    @BeforeEach
    void createClientsAndFinancialData() {
        for (UUID client : List.of(ALICE, BOB, EMPTY_CLIENT)) {
            jdbc.update("INSERT INTO users VALUES (?, ?)", client, client + "@example.test");
        }
        jdbc.update("INSERT INTO instruments VALUES (?, ?, ?)", INSTRUMENT, "SHARED", "Shared instrument");
        Timestamp now = Timestamp.from(Instant.parse("2026-01-01T12:00:00Z"));
        for (UUID client : List.of(ALICE, BOB)) {
            for (UUID account : ACCOUNTS.get(client)) {
                long quantity = account.getLeastSignificantBits();
                jdbc.update("INSERT INTO accounts VALUES (?, ?)", account, client);
                jdbc.update("INSERT INTO holdings VALUES (?, ?, ?, ?, ?)", account, INSTRUMENT, quantity, 100, now);
                jdbc.update("INSERT INTO cash_balances VALUES (?, ?, ?, ?)", account, "USD", quantity * 100, now);
                jdbc.update("INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        orderId(account), account, INSTRUMENT, new UUID(0, quantity + 200),
                        "BUY", quantity, "MARKET", "PENDING", now, null, now, 2);
            }
        }
    }

    static Stream<Object[]> clientCollections() {
        return Stream.of(ALICE, BOB, EMPTY_CLIENT)
                .flatMap(client -> COLLECTIONS.stream().map(path -> new Object[]{client, path}));
    }

    static Stream<Object[]> crossClientCollections() {
        return Stream.of(ALICE, BOB).flatMap(client -> COLLECTIONS.stream().map(path -> new Object[]{client, path}));
    }

    static Stream<Object[]> tamperedSelectors() {
        return crossClientCollections().flatMap(pair -> SELECTORS.stream()
                .map(selector -> new Object[]{pair[0], pair[1], selector}));
    }

    static Stream<Object[]> writeAttempts() {
        return crossClientCollections().flatMap(pair -> Stream.of("POST", "PUT", "PATCH", "DELETE")
                .flatMap(method -> Stream.of(false, true)
                        .filter(objectPath -> !(pair[1].equals("/orders") && method.equals("POST") && !objectPath))
                        .map(objectPath -> new Object[]{pair[0], pair[1], method, objectPath})));
    }

    static Stream<String> collections() { return COLLECTIONS.stream(); }

    static Stream<UUID> clients() { return Stream.of(ALICE, BOB); }

    @ParameterizedTest
    @MethodSource("clientCollections")
    void readsOnlyAllOfTheAuthenticatedClientsAccounts(UUID client, String path) throws Exception {
        assertOwnData(client, path, authenticated(get(API + path), client));
    }

    @ParameterizedTest
    @MethodSource("crossClientCollections")
    void untrustedIdentityHeadersCannotChangeTheJwtOwner(UUID client, String path) throws Exception {
        UUID victim = otherClient(client);
        assertOwnData(client, path, authenticated(get(API + path), client)
                .header("X-User-Id", victim).header("X-Client-Id", victim)
                .header("X-Account-Id", ACCOUNTS.get(victim).getFirst()));
    }

    @ParameterizedTest
    @MethodSource("tamperedSelectors")
    void clientAndObjectSelectorsAreExplicitlyForbidden(UUID client, String path, String selector) throws Exception {
        var before = snapshot();
        UUID victim = otherClient(client);
        UUID target = selector.startsWith("account") ? ACCOUNTS.get(victim).getFirst()
                : selector.startsWith("order") ? orderId(ACCOUNTS.get(victim).getFirst()) : victim;
        assertDenied(authenticated(get(API + path), client).param(selector, target.toString()));
        assertThat(snapshot()).isEqualTo(before);
    }

    @ParameterizedTest
    @MethodSource("crossClientCollections")
    void repeatedScopeParametersCannotHideTheVictimId(UUID client, String path) throws Exception {
        assertDenied(authenticated(get(API + path), client)
                .param("userId", client.toString(), otherClient(client).toString()));
    }

    @ParameterizedTest
    @MethodSource("crossClientCollections")
    void guessedObjectPathsAreForbidden(UUID client, String path) throws Exception {
        UUID target = targetId(otherClient(client), path);
        assertDenied(authenticated(get(API + path + "/" + target), client));
        // Unknown IDs have the same result, so the denial does not reveal existence.
        assertDenied(authenticated(get(API + path + "/" + new UUID(0, 999)), client));
    }

    @ParameterizedTest
    @MethodSource("writeAttempts")
    void crossClientWritesAreForbiddenAndNeitherClientsDataChanges(
            UUID client, String path, String method, boolean objectPath) throws Exception {
        UUID victim = otherClient(client);
        UUID account = ACCOUNTS.get(victim).getFirst();
        String uri = API + path + (objectPath ? "/" + targetId(victim, path) : "");
        var before = snapshot();
        String body = json.writeValueAsString(Map.of("userId", victim, "clientId", victim,
                "accountId", account, "orderId", orderId(account), "instrumentId", INSTRUMENT,
                "quantity", 999, "balance", 0, "status", "CANCELLED"));
        assertDenied(authenticated(request(HttpMethod.valueOf(method), uri), client)
                .contentType("application/json").content(body));
        assertThat(snapshot()).isEqualTo(before);
        // Denial did not damage either client's subsequent legitimate reads.
        assertOwnData(client, path, authenticated(get(API + path), client));
        assertOwnData(victim, path, authenticated(get(API + path), victim));
    }

    @ParameterizedTest
    @MethodSource("clients")
    void cancellationOfAnotherClientsOrderIsForbidden(UUID client) throws Exception {
        var before = snapshot();
        UUID order = orderId(ACCOUNTS.get(otherClient(client)).getFirst());
        assertDenied(authenticated(post(API + "/orders/" + order + "/cancel"), client));
        assertThat(snapshot()).isEqualTo(before);
    }

    @ParameterizedTest
    @MethodSource("collections")
    void missingAndInvalidTokensAre401RatherThanOwnershipDenials(String path) throws Exception {
        mvc.perform(withContextPath(get(API + path))).andExpect(status().isUnauthorized());
        mvc.perform(withContextPath(get(API + path)).header("Authorization", "Bearer invalid-token"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error").value("INVALID_TOKEN"));
        mvc.perform(withContextPath(post(API + path))).andExpect(status().isUnauthorized());
    }

    @Test
    void editingJwtSubjectCannotImpersonateAnotherClient() throws Exception {
        String[] parts = token(ALICE).split("\\.");
        ObjectNode payload = (ObjectNode) json.readTree(Base64.getUrlDecoder().decode(parts[1]));
        payload.put("sub", BOB.toString());
        String forged = parts[0] + "." + Base64.getUrlEncoder().withoutPadding()
                .encodeToString(json.writeValueAsBytes(payload)) + "." + parts[2];
        for (String path : COLLECTIONS) {
            mvc.perform(withContextPath(get(API + path)).header("Authorization", "Bearer " + forged))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error").value("INVALID_TOKEN"));
        }
    }

    private void assertOwnData(UUID client, String path, MockHttpServletRequestBuilder request) throws Exception {
        String body = mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode rows = json.readTree(body);
        assertThat(rows.isArray()).isTrue();
        List<String> accountIds = new ArrayList<>();
        for (JsonNode row : rows) {
            UUID account = UUID.fromString(row.get("accountId").asText());
            accountIds.add(account.toString());
            if (path.equals("/cash")) {
                assertThat(row.get("balance").asLong()).isEqualTo(account.getLeastSignificantBits() * 100);
            } else {
                assertThat(row.get("quantity").asLong()).isEqualTo(account.getLeastSignificantBits());
            }
            if (path.equals("/orders")) {
                assertThat(row.get("orderId").asText()).isEqualTo(orderId(account).toString());
                assertThat(row.get("status").asText()).isEqualTo("PENDING");
            }
        }
        assertThat(accountIds).containsExactlyInAnyOrderElementsOf(ACCOUNTS.get(client).stream().map(UUID::toString).toList());
    }

    private void assertDenied(MockHttpServletRequestBuilder request) throws Exception {
        mvc.perform(request).andExpect(status().isForbidden())
                .andExpect(content().json("{\"error\":\"ACCESS_DENIED\",\"message\":\"Access is denied.\"}", true))
                .andExpect(header().doesNotExist("Strict-Transport-Security"));
    }

    private MockHttpServletRequestBuilder authenticated(MockHttpServletRequestBuilder request, UUID client) {
        return withContextPath(request).header("Authorization", "Bearer " + token(client));
    }

    private MockHttpServletRequestBuilder withContextPath(MockHttpServletRequestBuilder request) {
        return request.contextPath(API);
    }

    private String token(UUID client) {
        return tokens.issueToken(client, client + "@example.test");
    }

    private static UUID otherClient(UUID client) { return client.equals(ALICE) ? BOB : ALICE; }
    private static UUID orderId(UUID account) { return new UUID(0, account.getLeastSignificantBits() + 100); }
    private static UUID targetId(UUID client, String path) {
        UUID account = ACCOUNTS.get(client).getFirst();
        return path.equals("/orders") ? orderId(account) : account;
    }

    private List<List<Map<String, Object>>> snapshot() {
        return List.of(jdbc.queryForList("SELECT * FROM accounts ORDER BY account_id"),
                jdbc.queryForList("SELECT * FROM holdings ORDER BY account_id, instrument_id"),
                jdbc.queryForList("SELECT * FROM cash_balances ORDER BY account_id, currency"),
                jdbc.queryForList("SELECT * FROM orders ORDER BY order_id"));
    }
}
