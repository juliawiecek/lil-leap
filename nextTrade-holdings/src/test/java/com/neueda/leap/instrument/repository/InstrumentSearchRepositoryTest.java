package com.neueda.leap.instrument.repository;

import com.neueda.leap.instrument.dto.InstrumentResponse;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration tests for instrument search repository (TS-13.5, BR-12).
 * Tests SQL ILIKE queries across symbol and name columns.
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "TEST_POSTGRES_URL", matches = ".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class InstrumentSearchRepositoryTest {
    private static final String SCHEMA = "search_repo_" + UUID.randomUUID().toString().replace("-", "");

    @Autowired JdbcTemplate jdbc;
    @Autowired InstrumentRepository repository;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) throws Exception {
        String url = System.getenv("TEST_POSTGRES_URL");
        var admin = new JdbcTemplate(new DriverManagerDataSource(url,
                System.getenv("TEST_POSTGRES_USER"), System.getenv("TEST_POSTGRES_PASSWORD")));
        admin.execute("CREATE SCHEMA " + SCHEMA);
        var schemaDb = new JdbcTemplate(new DriverManagerDataSource(
                url + (url.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA + ",public",
                System.getenv("TEST_POSTGRES_USER"), System.getenv("TEST_POSTGRES_PASSWORD")));
        schemaDb.execute(Files.readString(Path.of("../db/finalized-schema.sql")));
        properties.add("spring.datasource.url", () -> url + (url.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA + ",public");
        properties.add("spring.datasource.username", () -> System.getenv("TEST_POSTGRES_USER"));
        properties.add("spring.datasource.password", () -> System.getenv("TEST_POSTGRES_PASSWORD"));
    }

    private JdbcTemplate admin() {
        return new JdbcTemplate(new DriverManagerDataSource(System.getenv("TEST_POSTGRES_URL"),
                System.getenv("TEST_POSTGRES_USER"), System.getenv("TEST_POSTGRES_PASSWORD")));
    }

    @AfterAll
    void cleanup() {
        admin().execute("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
    }

    @BeforeEach
    void fixtures() {
        jdbc.execute("TRUNCATE instruments CASCADE");
        
        // Insert test instruments
        jdbc.update("INSERT INTO instruments(instrument_id,symbol,instrument_name,asset_class,market_code,currency,enabled,tradable) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), "AAPL", "Apple Inc.", "COMMON_STOCK", "NASDAQ", "USD", true, true);
        jdbc.update("INSERT INTO instruments(instrument_id,symbol,instrument_name,asset_class,market_code,currency,enabled,tradable) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), "AMZN", "Amazon.com Inc.", "COMMON_STOCK", "NASDAQ", "USD", true, true);
        jdbc.update("INSERT INTO instruments(instrument_id,symbol,instrument_name,asset_class,market_code,currency,enabled,tradable) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), "GOOGL", "Alphabet Inc.", "COMMON_STOCK", "NASDAQ", "USD", true, true);
        jdbc.update("INSERT INTO instruments(instrument_id,symbol,instrument_name,asset_class,market_code,currency,enabled,tradable) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), "MSFT", "Microsoft Corporation", "COMMON_STOCK", "NASDAQ", "USD", true, true);
        jdbc.update("INSERT INTO instruments(instrument_id,symbol,instrument_name,asset_class,market_code,currency,enabled,tradable) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), "GOOG", "Google LLC", "COMMON_STOCK", "NYSE", "USD", false, false);
    }

    /**
     * AC1: Search by partial symbol match (case-insensitive).
     */
    @Test
    void searchByPartialSymbol() {
        List<InstrumentResponse> results = repository.searchBySymbolOrName("AAP");
        
        assertThat(results).hasSize(1);
        assertThat(results.get(0).symbol()).isEqualTo("AAPL");
    }

    /**
     * AC1: Search by partial name match (case-insensitive).
     */
    @Test
    void searchByPartialName() {
        List<InstrumentResponse> results = repository.searchBySymbolOrName("amazon");
        
        assertThat(results).hasSize(1);
        assertThat(results.get(0).symbol()).isEqualTo("AMZN");
    }

    /**
     * Case-insensitive search: lowercase query matches uppercase symbol.
     */
    @Test
    void caseInsensitiveSymbolSearch() {
        List<InstrumentResponse> results = repository.searchBySymbolOrName("aapl");
        
        assertThat(results).hasSize(1);
        assertThat(results.get(0).symbol()).isEqualTo("AAPL");
    }

    /**
     * Case-insensitive search: uppercase query matches mixed-case name.
     */
    @Test
    void caseInsensitiveNameSearch() {
        List<InstrumentResponse> results = repository.searchBySymbolOrName("CORPORATION");
        
        assertThat(results).hasSize(1);
        assertThat(results.get(0).symbol()).isEqualTo("MSFT");
    }

    /**
     * AC3: Empty query returns empty list.
     */
    @Test
    void emptyQueryReturnsEmpty() {
        assertThat(repository.searchBySymbolOrName("")).isEmpty();
        assertThat(repository.searchBySymbolOrName(null)).isEmpty();
    }

    /**
     * No matches found returns empty list.
     */
    @Test
    void noMatchesReturnsEmpty() {
        List<InstrumentResponse> results = repository.searchBySymbolOrName("ZZZZ");
        
        assertThat(results).isEmpty();
    }

    /**
     * Multiple matches are returned, ordered by symbol.
     */
    @Test
    void multipleMatches() {
        List<InstrumentResponse> results = repository.searchBySymbolOrName("Inc");
        
        assertThat(results).hasSize(3); // Apple Inc., Amazon.com Inc., Alphabet Inc.
        assertThat(results.get(0).symbol()).isEqualTo("AAPL");
        assertThat(results.get(1).symbol()).isEqualTo("AMZN");
        assertThat(results.get(2).symbol()).isEqualTo("GOOGL");
    }

    /**
     * Search returns disabled instruments (unlike submission which filters them).
     */
    @Test
    void searchIncludesDisabledInstruments() {
        List<InstrumentResponse> results = repository.searchBySymbolOrName("GOOG");
        
        assertThat(results).hasSize(2); // GOOG (disabled) and GOOGL (enabled)
        // Find the disabled GOOG
        InstrumentResponse disabled = results.stream()
                .filter(r -> r.symbol().equals("GOOG"))
                .findFirst()
                .orElseThrow();
        assertThat(disabled.enabled()).isFalse();
        assertThat(disabled.tradable()).isFalse();
    }

    /**
     * Partial match works in middle of word.
     */
    @Test
    void partialMatchInMiddleOfName() {
        List<InstrumentResponse> results = repository.searchBySymbolOrName("soft");
        
        assertThat(results).hasSize(1);
        assertThat(results.get(0).symbol()).isEqualTo("MSFT"); // Microsoft
    }

    /**
     * Bounded result set: only 100 results max (verified by LIMIT in SQL).
     * This test inserts many instruments and verifies limit is respected.
     */
    @Test
    void resultSetIsBoundedTo100() {
        // Clear and insert 150 test instruments
        jdbc.execute("TRUNCATE instruments CASCADE");
        for (int i = 0; i < 150; i++) {
            jdbc.update("INSERT INTO instruments(instrument_id,symbol,instrument_name,asset_class,market_code,currency,enabled,tradable) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    UUID.randomUUID(), "TEST" + i, "Test Instrument " + i, "COMMON_STOCK", "TEST", "USD", true, true);
        }

        List<InstrumentResponse> results = repository.searchBySymbolOrName("TEST");
        
        assertThat(results).hasSize(100);
    }

    /**
     * Search results include all required fields from InstrumentResponse.
     */
    @Test
    void responseContainsAllFields() {
        List<InstrumentResponse> results = repository.searchBySymbolOrName("AAPL");
        
        assertThat(results).hasSize(1);
        InstrumentResponse inst = results.get(0);
        assertThat(inst.instrumentId()).isNotNull();
        assertThat(inst.symbol()).isEqualTo("AAPL");
        assertThat(inst.instrumentName()).isEqualTo("Apple Inc.");
        assertThat(inst.assetClass()).isEqualTo("COMMON_STOCK");
        assertThat(inst.marketCode()).isEqualTo("NASDAQ");
        assertThat(inst.currency()).isEqualTo("USD");
        assertThat(inst.enabled()).isTrue();
        assertThat(inst.tradable()).isTrue();
    }
}
