package com.neueda.leap.order.settlement;

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

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Recovery against the production schema, including the holdings projection trigger and jsonb audit payloads. */
@SpringBootTest(properties = {"orders.execution.enabled=false", "orders.settlement.integrity-check.enabled=false"})
@EnabledIfEnvironmentVariable(named = "TEST_POSTGRES_URL", matches = ".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SettlementRecoveryPostgresTest {
    private static final String SCHEMA = "settlement_" + UUID.randomUUID().toString().replace("-", "");
    @Autowired JdbcTemplate jdbc;
    @Autowired SettlementRecoveryService service;
    private UUID account;
    private UUID instrument;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) throws Exception {
        String url = System.getenv("TEST_POSTGRES_URL");
        String schemaUrl = url + (url.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA + ",public";
        admin().execute("CREATE SCHEMA " + SCHEMA);
        new JdbcTemplate(new DriverManagerDataSource(schemaUrl, System.getenv("TEST_POSTGRES_USER"),
                System.getenv("TEST_POSTGRES_PASSWORD"))).execute(Files.readString(Path.of("../db/finalized-schema.sql")));
        properties.add("spring.datasource.url", () -> schemaUrl);
        properties.add("spring.datasource.username", () -> System.getenv("TEST_POSTGRES_USER"));
        properties.add("spring.datasource.password", () -> System.getenv("TEST_POSTGRES_PASSWORD"));
    }

    private static JdbcTemplate admin() {
        return new JdbcTemplate(new DriverManagerDataSource(System.getenv("TEST_POSTGRES_URL"),
                System.getenv("TEST_POSTGRES_USER"), System.getenv("TEST_POSTGRES_PASSWORD")));
    }

    @AfterAll
    void cleanup() {
        admin().execute("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
    }

    @BeforeEach
    void fixtures() {
        jdbc.execute("TRUNCATE users, instruments CASCADE");
        UUID user = UUID.randomUUID();
        account = UUID.randomUUID();
        instrument = UUID.randomUUID();
        jdbc.update("INSERT INTO users(user_id,email,password_hash) VALUES (?, 'ops@example.test', 'test-only')", user);
        jdbc.update("""
                INSERT INTO accounts(account_id,user_id,account_number,account_name,account_status,trading_enabled)
                VALUES (?, ?, 'TEST', 'Test', 'ACTIVE', TRUE)
                """, account, user);
        jdbc.update("""
                INSERT INTO instruments(instrument_id,symbol,instrument_name,asset_class,market_code,currency)
                VALUES (?, 'AAPL', 'Apple', 'COMMON_STOCK', 'NASDAQ', 'USD')
                """, instrument);
        jdbc.update("INSERT INTO cash_balances(account_id,balance) VALUES (?, 1000)", account);
    }

    @Test
    void recoveredBuyUpdatesHoldingsThroughTheProjectionAndAuditsAsJson() {
        UUID fill = fill("BUY", 4, "25");

        assertThat(service.reportIncomplete()).containsExactly(fill);
        var result = service.recover(fill);

        assertThat(result.repaired()).hasSize(4);
        assertThat(jdbc.queryForObject("SELECT quantity FROM holdings WHERE account_id = ? AND instrument_id = ?",
                Long.class, account, instrument)).isEqualTo(4);
        assertThat(jdbc.queryForObject("SELECT balance FROM cash_balances WHERE account_id = ?", BigDecimal.class, account))
                .isEqualByComparingTo("900.00");
        assertThat(jdbc.queryForObject("""
                SELECT payload->>'fillId' FROM audit_log WHERE event_type = 'SETTLEMENT_RECOVERED'
                """, String.class)).isEqualTo(fill.toString());
        assertThat(jdbc.queryForObject("""
                SELECT jsonb_array_length(payload->'missing') FROM audit_log WHERE event_type = 'SETTLEMENT_INCOMPLETE'
                """, Integer.class)).isEqualTo(4);
        assertThat(service.reportIncomplete()).isEmpty();
    }

    @Test
    void sellWithoutTheSharesCannotBeRecovered() {
        UUID fill = fill("SELL", 4, "25");

        assertThatThrownBy(() -> service.recover(fill))
                .isInstanceOfSatisfying(SettlementException.class,
                        failure -> assertThat(failure.code()).isEqualTo("RECOVERY_FAILED"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM holding_movements", Integer.class)).isZero();
    }

    @Test
    void unappliedSettlementRollsBack() {
        UUID fill = fill("BUY", 1, "25");

        service.rollback(fill);

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM fills", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM orders", String.class)).isEqualTo("REJECTED");
    }

    private UUID fill(String side, long quantity, String price) {
        UUID order = UUID.randomUUID();
        UUID fill = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO orders(order_id, account_id, instrument_id, client_reference, side, quantity, status)
                VALUES (?, ?, ?, ?, ?, ?, 'ACCEPTED')
                """, order, account, instrument, UUID.randomUUID(), side, quantity);
        jdbc.update("""
                INSERT INTO fills(fill_id, order_id, filled_quantity, execution_price, quote_timestamp)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, fill, order, quantity, new BigDecimal(price));
        return fill;
    }
}
