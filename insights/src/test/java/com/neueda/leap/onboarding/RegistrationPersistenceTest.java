package com.neueda.leap.onboarding;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.neueda.leap.common.exception.GlobalExceptionHandler;
import com.neueda.leap.onboarding.controller.RegistrationController;
import com.neueda.leap.onboarding.dto.RegisterUserRequest;
import com.neueda.leap.onboarding.entity.CustomerProfile;
import com.neueda.leap.onboarding.repository.CustomerProfileRepository;
import com.neueda.leap.onboarding.service.RegistrationService;
import com.neueda.leap.onboarding.service.RegistrationServiceImpl;
import com.neueda.leap.security.SsnEncryptionService;
import com.neueda.leap.user.entity.User;
import com.neueda.leap.user.repository.UserRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Runs the real registration transaction against finalized-schema.sql in an isolated schema. */
@SpringBootTest(classes = RegistrationPersistenceTest.Config.class)
@AutoConfigureMockMvc(addFilters = false)
@EnabledIfEnvironmentVariable(named = "REGISTRATION_TEST_DB_URL", matches = ".+")
class RegistrationPersistenceTest {
    private static final String URL = System.getenv("REGISTRATION_TEST_DB_URL");
    private static final String USER = System.getenv().getOrDefault("REGISTRATION_TEST_DB_USER", "postgres");
    private static final String PASSWORD = System.getenv().getOrDefault("REGISTRATION_TEST_DB_PASSWORD", "");
    private static final String SCHEMA = "registration_" + UUID.randomUUID().toString().replace("-", "");

    @Configuration
    @EnableAutoConfiguration
    @EntityScan(basePackageClasses = {User.class, CustomerProfile.class})
    @EnableJpaRepositories(basePackageClasses = {UserRepository.class, CustomerProfileRepository.class})
    @Import({RegistrationServiceImpl.class, RegistrationController.class, SsnEncryptionService.class, GlobalExceptionHandler.class})
    static class Config {
        @Bean PasswordEncoder passwordEncoder() { return PasswordEncoderFactories.createDelegatingPasswordEncoder(); }
    }

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) throws Exception {
        try (var connection = DriverManager.getConnection(URL, USER, PASSWORD); var sql = connection.createStatement()) {
            sql.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public");
            sql.execute("CREATE SCHEMA " + SCHEMA);
            sql.execute("SET search_path TO " + SCHEMA + ", public");
            sql.execute(Files.readString(Path.of("../db/finalized-schema.sql")));
        }
        properties.add("spring.datasource.url", () -> URL + (URL.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA + ",public");
        properties.add("spring.datasource.username", () -> USER);
        properties.add("spring.datasource.password", () -> PASSWORD);
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "none");
        properties.add("spring.jpa.properties.hibernate.jdbc.time_zone", () -> "UTC");
        properties.add("spring.datasource.hikari.connection-init-sql", () -> "SET TIME ZONE 'UTC'");
        properties.add("spring.sql.init.mode", () -> "never");
        properties.add("server.servlet.context-path", () -> "");
        properties.add("nexttrade.security.ssn-encryption-key", () -> "synthetic-registration-test-key");
    }

    @AfterAll
    static void dropSchema() throws Exception {
        try (var connection = DriverManager.getConnection(URL, USER, PASSWORD); var sql = connection.createStatement()) {
            sql.execute("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
        }
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired RegistrationService registration;
    @Autowired PasswordEncoder encoder;

    @BeforeEach
    void clean() { jdbc.execute("TRUNCATE users CASCADE"); }

    private ObjectNode payload() throws Exception {
        return ((ObjectNode) mapper.readTree("""
            {"first_name":" Test ","last_name":" Client ","email":"CLIENT@example.test",
             "phone":"555-0100","password":"Password123!","street_address":"1 Test Way",
             "city":"Test City","state_province":"TX","postal_code":"12345","country":"US",
             "citizenship_status":"PERMANENT_RESIDENT","ssn":"111-22-3333",
             "account_name":"Trading","account_type":"INDIVIDUAL_CASH","trader_level":"NOVICE"}
            """)).put("date_of_birth", LocalDate.now(ZoneOffset.UTC).minusYears(21).toString());
    }

    @ParameterizedTest
    @ValueSource(strings = {"/clients/register", "/users"})
    void registrationPersistsIdentityAndMvpDefaults(String endpoint) throws Exception {
        mvc.perform(post(endpoint).contentType("application/json").content(payload().toString()))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.email").value("client@example.test"))
                .andExpect(jsonPath("$.firstName").value("Test"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist()).andExpect(jsonPath("$.ssn").doesNotExist());
        for (String table : new String[]{"users", "customer_profiles", "financial_profiles", "accounts"}) {
            assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class));
        }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM users u JOIN customer_profiles c USING(user_id) JOIN financial_profiles f USING(user_id)", Integer.class));
        assertTrue(encoder.matches("Password123!", jdbc.queryForObject("SELECT password_hash FROM users", String.class)));
        assertEquals("PERMANENT_RESIDENT", jdbc.queryForObject("SELECT citizenship_status FROM customer_profiles", String.class));
        assertEquals("111223333", jdbc.queryForObject("SELECT pgp_sym_decrypt(ssn_encrypted, ?) FROM customer_profiles", String.class, "synthetic-registration-test-key"));
        assertEquals("PENDING", jdbc.queryForObject("SELECT kyc_status FROM financial_profiles", String.class));
        assertFalse(jdbc.queryForObject("SELECT accredited_investor OR funds_source_verified FROM financial_profiles", Boolean.class));
        assertNull(jdbc.queryForObject("SELECT risk_profile FROM financial_profiles", String.class));
    }

    @Test
    void optionalKycUsesDatabaseTokensAndJsonObjects() throws Exception {
        var request = payload().put("net_worth_bracket", "$100k-500k").put("risk_profile", "MODERATE")
                .put("accredited_investor", true).put("broker_affiliation", true)
                .put("broker_firm_name", "Test Firm").put("broker_affiliation_details", "Line one\nLine two");
        registration.register(mapper.treeToValue(request, RegisterUserRequest.class));
        assertEquals("$100k-500k", jdbc.queryForObject("SELECT net_worth_bracket FROM financial_profiles", String.class));
        assertEquals("object", jdbc.queryForObject("SELECT jsonb_typeof(regulatory_disclosures) FROM financial_profiles", String.class));
        assertTrue(jdbc.queryForObject("SELECT accredited_investor FROM financial_profiles", Boolean.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"customer_profiles", "financial_profiles", "accounts"})
    void failureInAnyLaterInsertRollsBackEverything(String table) throws Exception {
        jdbc.execute("ALTER TABLE " + table + " ADD CONSTRAINT test_registration_failure CHECK (false) NOT VALID");
        try {
            var request = mapper.treeToValue(payload(), RegisterUserRequest.class);
            assertThrows(DataIntegrityViolationException.class, () -> registration.register(request));
            for (String persisted : new String[]{"users", "customer_profiles", "financial_profiles", "accounts"}) {
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM " + persisted, Integer.class));
            }
        } finally {
            jdbc.execute("ALTER TABLE " + table + " DROP CONSTRAINT test_registration_failure");
        }
    }

    @Test
    void underageAndFutureDatesAreRejectedWithoutWrites() throws Exception {
        for (LocalDate dob : new LocalDate[]{LocalDate.now(ZoneOffset.UTC).minusYears(21).plusDays(1), LocalDate.now(ZoneOffset.UTC).minusYears(18), LocalDate.now(ZoneOffset.UTC).plusDays(1)}) {
            mvc.perform(post("/clients/register").contentType("application/json").content(payload().put("date_of_birth", dob.toString()).toString()))
                    .andExpect(status().isBadRequest());
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM users", Integer.class));
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"date_of_birth", "citizenship_status", "phone", "ssn"})
    void missingIdentityFieldsAreRejected(String field) throws Exception {
        var request = payload();
        request.remove(field);
        mvc.perform(post("/clients/register").contentType("application/json").content(request.toString()))
                .andExpect(status().isBadRequest());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM users", Integer.class));
    }

    @Test
    void duplicateEmailDoesNotCreateExtraProfiles() throws Exception {
        registration.register(mapper.treeToValue(payload(), RegisterUserRequest.class));
        mvc.perform(post("/clients/register").contentType("application/json").content(payload().put("email", "client@example.test").toString()))
                .andExpect(status().isConflict());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM users", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM financial_profiles", Integer.class));
    }
}
