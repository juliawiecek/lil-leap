package com.neueda.leap.order.settlement;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Detection, recovery and rollback of one fill's settlement (TS-10.3, BR-09) against an in-memory database. */
class SettlementRecoveryServiceTest {
    private JdbcTemplate jdbc;
    private SettlementRecoveryService service;
    private UUID account;
    private UUID instrument;

    @BeforeEach
    void setUp() {
        var dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:settlement-" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        new ResourceDatabasePopulator(new ClassPathResource("settlement/schema.sql")).execute(dataSource);
        jdbc = new JdbcTemplate(dataSource);
        service = new SettlementRecoveryService(jdbc, new DataSourceTransactionManager(dataSource));
        account = UUID.randomUUID();
        instrument = UUID.randomUUID();
        jdbc.update("INSERT INTO accounts(account_id) VALUES (?)", account);
        jdbc.update("INSERT INTO cash_balances(account_id, balance) VALUES (?, 1000)", account);
    }

    @Test
    void buyWithOnlyAFillIsReportedOnceAndRecoveredFromTheFill() {
        UUID fill = fill("BUY", 10, "25.005", "ACCEPTED");

        assertThat(service.reportIncomplete()).containsExactly(fill);
        assertThat(service.reportIncomplete()).containsExactly(fill);
        assertThat(events(SettlementRecoveryService.INCOMPLETE)).isEqualTo(1);

        var result = service.recover(fill);

        assertThat(result.action()).isEqualTo("RECOVERED");
        assertThat(result.repaired()).containsExactly(SettlementPart.HOLDING_MOVEMENT, SettlementPart.CASH_TRANSACTION,
                SettlementPart.ORDER_STATUS, SettlementPart.COMPLETION_AUDIT);
        assertThat(jdbc.queryForObject("SELECT quantity_change FROM holding_movements WHERE fill_id = ?", Long.class, fill))
                .isEqualTo(10);
        assertThat(jdbc.queryForObject("SELECT amount FROM cash_transactions WHERE fill_id = ?", BigDecimal.class, fill))
                .isEqualByComparingTo("-250.05");
        assertThat(balance()).isEqualByComparingTo("749.95");
        assertThat(jdbc.queryForObject("SELECT status FROM orders", String.class)).isEqualTo("FILLED");
        assertThat(jdbc.queryForObject("SELECT reason_code FROM order_status_history", String.class))
                .isEqualTo(SettlementRecoveryService.RECOVERED);
        assertThat(events(SettlementRecoveryService.COMPLETED)).isEqualTo(1);
        assertThat(events(SettlementRecoveryService.RECOVERED)).isEqualTo(1);
        assertThat(service.reportIncomplete()).isEmpty();
    }

    @Test
    void sellRecoveryOnlyAddsTheMissingCashAndOpensABalanceWhenNoneExists() {
        jdbc.update("DELETE FROM cash_balances");
        UUID fill = fill("SELL", 4, "50", "FILLED");
        jdbc.update("""
                INSERT INTO holding_movements(account_id, instrument_id, fill_id, quantity_change, cost_basis, movement_type)
                VALUES (?, ?, ?, -4, 50, 'SELL')
                """, account, instrument, fill);
        completionAudit(fill);

        var result = service.recover(fill);

        assertThat(result.repaired()).containsExactly(SettlementPart.CASH_TRANSACTION);
        assertThat(balance()).isEqualByComparingTo("200.00");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM holding_movements", Integer.class)).isEqualTo(1);
    }

    @Test
    void completeSettlementIsLeftAloneButTheRequestIsStillAudited() {
        UUID fill = fill("BUY", 1, "10", "FILLED");
        service.recover(fill);
        assertThat(service.reportIncomplete()).isEmpty();

        var again = service.recover(fill);

        assertThat(again.action()).isEqualTo(SettlementRecoveryService.ALREADY_COMPLETE);
        assertThat(again.repaired()).isEmpty();
        assertThat(balance()).isEqualByComparingTo("990.00");
        assertThat(events(SettlementRecoveryService.RECOVERED)).isEqualTo(2);
    }

    @Test
    void recoveryThatWouldOverdrawCashChangesNothing() {
        UUID fill = fill("BUY", 100, "25", "ACCEPTED");

        assertThatThrownBy(() -> service.recover(fill))
                .isInstanceOfSatisfying(SettlementException.class, failure -> {
                    assertThat(failure.status()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(failure.code()).isEqualTo("RECOVERY_FAILED");
                });
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM holding_movements", Integer.class)).isZero();
        assertThat(balance()).isEqualByComparingTo("1000.00");
        assertThat(events(SettlementRecoveryService.RECOVERED)).isZero();
    }

    @Test
    void unappliedSettlementRollsBackByRemovingTheFillAndRejectingTheOrder() {
        UUID fill = fill("BUY", 2, "10", "ACCEPTED");

        var result = service.rollback(fill);

        assertThat(result.action()).isEqualTo("ROLLED_BACK");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM fills", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM orders", String.class)).isEqualTo("REJECTED");
        assertThat(jdbc.queryForObject("SELECT reason_code FROM order_status_history", String.class))
                .isEqualTo(SettlementRecoveryService.ROLLED_BACK);
        assertThat(events(SettlementRecoveryService.ROLLED_BACK)).isEqualTo(1);
        assertThat(balance()).isEqualByComparingTo("1000.00");
    }

    @Test
    void settlementThatChangedBalancesCannotBeRolledBack() {
        UUID fill = fill("BUY", 1, "10", "FILLED");
        service.recover(fill);

        assertThatThrownBy(() -> service.rollback(fill))
                .isInstanceOfSatisfying(SettlementException.class,
                        failure -> assertThat(failure.code()).isEqualTo("SETTLEMENT_APPLIED"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM fills", Integer.class)).isEqualTo(1);
        assertThat(events(SettlementRecoveryService.ROLLED_BACK)).isZero();
    }

    @Test
    void unknownSettlementIsNotFound() {
        UUID unknown = UUID.randomUUID();

        assertThatThrownBy(() -> service.recover(unknown))
                .isInstanceOfSatisfying(SettlementException.class,
                        failure -> assertThat(failure.status()).isEqualTo(HttpStatus.NOT_FOUND));
        assertThatThrownBy(() -> service.rollback(unknown)).isInstanceOf(SettlementException.class);
    }

    private UUID fill(String side, long quantity, String price, String orderStatus) {
        UUID order = UUID.randomUUID();
        UUID fill = UUID.randomUUID();
        jdbc.update("INSERT INTO orders(order_id, account_id, instrument_id, side, quantity, status) VALUES (?, ?, ?, ?, ?, ?)",
                order, account, instrument, side, quantity, orderStatus);
        jdbc.update("INSERT INTO fills(fill_id, order_id, filled_quantity, execution_price) VALUES (?, ?, ?, ?)",
                fill, order, quantity, new BigDecimal(price));
        return fill;
    }

    private void completionAudit(UUID fill) {
        jdbc.update("""
                INSERT INTO audit_log(account_id, related_order_id, actor_type, event_type)
                SELECT ?, order_id, 'SYSTEM', 'SETTLEMENT_COMPLETED' FROM fills WHERE fill_id = ?
                """, account, fill);
    }

    private BigDecimal balance() {
        return jdbc.queryForObject("SELECT balance FROM cash_balances WHERE account_id = ?", BigDecimal.class, account);
    }

    private int events(String eventType) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM audit_log WHERE event_type = ?", Integer.class, eventType);
    }
}
