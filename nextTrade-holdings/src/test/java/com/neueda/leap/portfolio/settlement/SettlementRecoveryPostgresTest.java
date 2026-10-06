package com.neueda.leap.portfolio.settlement;

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
import org.springframework.transaction.PlatformTransactionManager;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration tests for settlement recovery (TS-10.3, BR-09).
 * Tests "ledger wins" rule and idempotent recovery operations.
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "TEST_POSTGRES_URL", matches = ".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SettlementRecoveryPostgresTest {
    private static final String SCHEMA = "settlement_recovery_" + UUID.randomUUID().toString().replace("-", "");

    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager manager;
    @Autowired SettlementRecoveryService recoveryService;
    @Autowired SettlementIntegrityRepository integrity;

    private UUID user, account, instrument;

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
        jdbc.execute("TRUNCATE users, instruments, orders, fills, holding_movements, holdings, cash_transactions, cash_balances CASCADE");
        
        user = UUID.randomUUID();
        account = UUID.randomUUID();
        instrument = UUID.randomUUID();

        jdbc.update("INSERT INTO users(user_id,email,password_hash) VALUES (?, 'trader@example.test', 'test-only')", user);
        jdbc.update("""
            INSERT INTO accounts(account_id,user_id,account_number,account_name,account_status,trading_enabled,min_balance_requirement)
            VALUES (?, ?, 'TEST', 'Test', 'ACTIVE', TRUE, 1)
            """, account, user);
        jdbc.update("INSERT INTO instruments(instrument_id,symbol,instrument_name,asset_class,market_code,currency) VALUES (?, 'AAPL', 'Apple', 'COMMON_STOCK', 'NASDAQ', 'USD')", instrument);
    }

    /**
     * AC1: A settlement left partially applied (e.g. ledger row written, cache/audit row missing)
     * is detected by a startup or scheduled integrity check.
     */
    @Test
    void detectsPartiallyAppliedSettlement() {
        // Simulate partial settlement: ledger written, cache deleted
        UUID orderId = UUID.randomUUID();
        UUID fillId = UUID.randomUUID();
        
        // Create order first (required by FK constraint)
        jdbc.update("""
            INSERT INTO orders(order_id,account_id,instrument_id,client_reference,side,quantity,order_type,status)
            VALUES (?, ?, ?, ?, 'BUY', ?, 'MARKET', 'ACCEPTED')
            """,
            orderId, account, instrument, UUID.randomUUID(), 10);
        
        jdbc.update("INSERT INTO fills(fill_id,order_id,filled_quantity,execution_price,quote_timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                fillId, orderId, 10, new BigDecimal("225.04"));
        
        jdbc.update("""
            INSERT INTO holding_movements(account_id,instrument_id,fill_id,quantity_change,cost_basis,movement_type)
            VALUES (?, ?, ?, ?, ?, 'BUY')
            """,
            account, instrument, fillId, 10, new BigDecimal("225.04"));

        jdbc.update("""
            DELETE FROM holdings WHERE account_id = ?
            """,
            account);
        
        // Integrity check should detect the mismatch
        boolean hasIncomplete = integrity.hasIncompleteSettlement(account);
        assertThat(hasIncomplete).isTrue();
    }

    /**
     * AC2: POST /settlements/recover reconciles holdings/cash_balances from holding_movements/cash_transactions
     * for one settlement ID, applying "ledger wins" rule when the two disagree.
     */
    @Test
    void reconcilesCacheFromLedger() {
        // Set up partial settlement
        UUID fillId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        
        // Create order first (required by FK constraint)
        jdbc.update("""
            INSERT INTO orders(order_id,account_id,instrument_id,client_reference,side,quantity,order_type,status)
            VALUES (?, ?, ?, ?, 'BUY', ?, 'MARKET', 'ACCEPTED')
            """,
            orderId, account, instrument, UUID.randomUUID(), 10);
        
        jdbc.update("INSERT INTO fills(fill_id,order_id,filled_quantity,execution_price,quote_timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                fillId, orderId, 10, new BigDecimal("225.04"));
        
        jdbc.update("""
            INSERT INTO holding_movements(account_id,instrument_id,fill_id,quantity_change,cost_basis,movement_type)
            VALUES (?, ?, ?, ?, ?, 'BUY')
            """,
            account, instrument, fillId, 10, new BigDecimal("225.04"));

        // Trigger auto-creates holdings. Set cache to wrong value to simulate partial failure
        jdbc.update("UPDATE holdings SET quantity = ? WHERE account_id = ? AND instrument_id = ?",
                0, account, instrument);

        // Recover
        var result = recoveryService.recover(account);

        assertThat(result.status()).isEqualTo("RECOVERED");
        assertThat(result.holdingsReconciled()).isGreaterThan(0);

        // Verify cache is now correct
        Long cachedQty = jdbc.queryForObject(
                "SELECT quantity FROM holdings WHERE account_id = ? AND instrument_id = ?",
                Long.class, account, instrument);
        assertThat(cachedQty).isEqualTo(10L);
    }

    /**
     * AC3: Every recovery/rollback action writes its own audit_log row,
     * distinguishable from the original settlement event.
     * (Noted: This is a future enhancement; for now we track via result status)
     */
    @Test
    void recoveryIsIdempotent() {
        // Set up and recover once
        UUID fillId1 = UUID.randomUUID();
        UUID orderId1 = UUID.randomUUID();
        
        // Create order first (required by FK constraint)
        jdbc.update("""
            INSERT INTO orders(order_id,account_id,instrument_id,client_reference,side,quantity,order_type,status)
            VALUES (?, ?, ?, ?, 'BUY', ?, 'MARKET', 'ACCEPTED')
            """,
            orderId1, account, instrument, UUID.randomUUID(), 5);
        
        jdbc.update("INSERT INTO fills(fill_id,order_id,filled_quantity,execution_price,quote_timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                fillId1, orderId1, 5, new BigDecimal("100.00"));
        
        jdbc.update("""
            INSERT INTO holding_movements(account_id,instrument_id,fill_id,quantity_change,cost_basis,movement_type)
            VALUES (?, ?, ?, ?, ?, 'BUY')
            """,
            account, instrument, fillId1, 5, new BigDecimal("100.00"));

        // Delete cache to force recovery
        jdbc.update("""
            DELETE FROM holdings WHERE account_id = ?
            """,
            account);

        var result1 = recoveryService.recover(account);
        assertThat(result1.status()).isEqualTo("RECOVERED");
        Long qty1 = jdbc.queryForObject(
                "SELECT quantity FROM holdings WHERE account_id = ? AND instrument_id = ?",
                Long.class, account, instrument);

        // Call recover again - should be idempotent
        var result2 = recoveryService.recover(account);
        assertThat(result2.status()).isEqualTo("CONSISTENT"); // No mismatches now
        
        Long qty2 = jdbc.queryForObject(
                "SELECT quantity FROM holdings WHERE account_id = ? AND instrument_id = ?",
                Long.class, account, instrument);
        
        assertThat(qty1).isEqualTo(qty2); // No change
    }

    /**
     * Rollback removes cache but preserves ledger audit trail.
     */
    @Test
    void rollbackPreservesLedgerAuditTrail() {
        // Set up settlement
        UUID fillId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        
        // Create order first (required by FK constraint)
        jdbc.update("""
            INSERT INTO orders(order_id,account_id,instrument_id,client_reference,side,quantity,order_type,status)
            VALUES (?, ?, ?, ?, 'BUY', ?, 'MARKET', 'ACCEPTED')
            """,
            orderId, account, instrument, UUID.randomUUID(), 10);
        
        jdbc.update("INSERT INTO fills(fill_id,order_id,filled_quantity,execution_price,quote_timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                fillId, orderId, 10, new BigDecimal("225.04"));
        
        jdbc.update("""
            INSERT INTO holding_movements(account_id,instrument_id,fill_id,quantity_change,cost_basis,movement_type)
            VALUES (?, ?, ?, ?, ?, 'BUY')
            """,
            account, instrument, fillId, 10, new BigDecimal("225.04"));

        // Trigger will auto-create holdings

        // Verify holdings exist before rollback
        Long qtyBefore = jdbc.queryForObject(
                "SELECT quantity FROM holdings WHERE account_id = ? AND instrument_id = ?",
                Long.class, account, instrument);
        assertThat(qtyBefore).isEqualTo(10L);

        // Rollback
        var result = recoveryService.rollback(account);
        assertThat(result.status()).isEqualTo("RECOVERED");

        // Holdings should be deleted
        Integer qtyAfter = jdbc.queryForObject(
                "SELECT COUNT(*) FROM holdings WHERE account_id = ? AND instrument_id = ?",
                Integer.class, account, instrument);
        assertThat(qtyAfter).isEqualTo(0);

        // But ledger (holding_movements) should remain
        Long movementCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM holding_movements WHERE account_id = ?",
                Long.class, account);
        assertThat(movementCount).isEqualTo(1L);
    }
}
