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
        UUID trade = tradeFor(fill);

        assertThat(service.status(trade).status()).isEqualTo("NOT_SETTLED");

        var firstCheck = service.reportIncomplete();
        var secondCheck = service.reportIncomplete();

        assertThat(firstCheck).containsExactly(fill);
        assertThat(secondCheck).containsExactly(fill);
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
        assertThat(service.status(trade)).isEqualTo(new SettlementStatusResponse(trade, "SETTLED", fill));
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

    @Test
    void unknownTradeStatusIsNotFound() {
        assertThatThrownBy(() -> service.status(UUID.randomUUID()))
                .isInstanceOfSatisfying(SettlementException.class,
                        failure -> assertThat(failure.status()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void ledgerMismatchIsInconsistentEvenWhenTheCacheWouldLookComplete() {
        UUID fill = fill("BUY", 1, "10", "FILLED");
        UUID trade = tradeFor(fill);
        jdbc.update("INSERT INTO cash_transactions(account_id, fill_id, transaction_type, amount, currency, settlement_status, settled_at) "
                        + "VALUES (?, ?, 'BUY', -10, 'USD', 'SETTLED', CURRENT_TIMESTAMP)", account, fill);
        completionAudit(fill);

        assertThat(service.status(trade).status()).isEqualTo("INCONSISTENT");
    }

    @Test
    void orderWithoutAFillIsRejectedOrNotSettledByItsStatus() {
        UUID rejected = order("BUY", 3, "REJECTED");
        UUID waiting = order("BUY", 3, "ACCEPTED");

        assertThat(service.status(rejected)).isEqualTo(new SettlementStatusResponse(rejected, "REJECTED", null));
        assertThat(service.status(waiting)).isEqualTo(new SettlementStatusResponse(waiting, "NOT_SETTLED", null));
    }

    @Test
    void rejectedOrderWithAFillButNoBalanceChangeIsRejected() {
        UUID fill = fill("BUY", 2, "10", "REJECTED");
        completionAudit(fill);

        assertThat(service.status(tradeFor(fill)).status()).isEqualTo("REJECTED");
    }

    @Test
    void rejectedOrderWhoseFillMovedHoldingsOrCashIsInconsistent() {
        UUID moved = fill("BUY", 2, "10", "REJECTED");
        movement(moved, "BUY", 2, "10");
        UUID paid = fill("SELL", 2, "10", "REJECTED");
        cash(paid, "SELL", "20.00");

        assertThat(service.status(tradeFor(moved)).status()).isEqualTo("INCONSISTENT");
        assertThat(service.status(tradeFor(paid)).status()).isEqualTo("INCONSISTENT");
    }

    @Test
    void filledOrderMissingAnyLedgerLegOrTheCompletionAuditIsInconsistent() {
        UUID bare = fill("BUY", 1, "10", "FILLED");
        UUID noCash = fill("BUY", 1, "10", "FILLED");
        movement(noCash, "BUY", 1, "10");
        completionAudit(noCash);
        UUID noAudit = fill("BUY", 1, "10", "FILLED");
        movement(noAudit, "BUY", 1, "10");
        cash(noAudit, "BUY", "-10.00");

        assertThat(service.status(tradeFor(bare)).status()).isEqualTo("INCONSISTENT");
        assertThat(service.status(tradeFor(noCash)).status()).isEqualTo("INCONSISTENT");
        assertThat(service.status(tradeFor(noAudit)).status()).isEqualTo("INCONSISTENT");
    }

    @Test
    void waitingOrderWithOnlyPartOfItsSettlementIsInconsistent() {
        UUID movedOnly = fill("BUY", 1, "10", "ACCEPTED");
        movement(movedOnly, "BUY", 1, "10");
        UUID paidOnly = fill("BUY", 1, "10", "ACCEPTED");
        cash(paidOnly, "BUY", "-10.00");
        UUID auditedOnly = fill("BUY", 1, "10", "ACCEPTED");
        completionAudit(auditedOnly);

        assertThat(service.status(tradeFor(movedOnly)).status()).isEqualTo("INCONSISTENT");
        assertThat(service.status(tradeFor(paidOnly)).status()).isEqualTo("INCONSISTENT");
        assertThat(service.status(tradeFor(auditedOnly)).status()).isEqualTo("INCONSISTENT");
    }

    @Test
    void settlementWithOnlyItsCashLegCannotBeRolledBack() {
        UUID fill = fill("SELL", 2, "10", "ACCEPTED");
        cash(fill, "SELL", "20.00");

        assertThatThrownBy(() -> service.rollback(fill))
                .isInstanceOfSatisfying(SettlementException.class, failure -> {
                    assertThat(failure.status()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(failure.code()).isEqualTo("SETTLEMENT_APPLIED");
                });
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM fills", Integer.class)).isEqualTo(1);
    }

    @Test
    void sellWithOnlyAFillIsRecoveredByRemovingSharesAndCreditingCash() {
        UUID fill = fill("SELL", 3, "20", "ACCEPTED");

        assertThat(service.reportIncomplete()).containsExactly(fill);
        assertThat(jdbc.queryForObject("SELECT payload FROM audit_log WHERE event_type = ?", String.class,
                SettlementRecoveryService.INCOMPLETE))
                .contains(fill.toString())
                .contains("\"missing\":[\"HOLDING_MOVEMENT\",\"CASH_TRANSACTION\",\"ORDER_STATUS\",\"COMPLETION_AUDIT\"]");

        var result = service.recover(fill);

        assertThat(result.action()).isEqualTo("RECOVERED");
        assertThat(jdbc.queryForObject("SELECT quantity_change FROM holding_movements WHERE fill_id = ?", Long.class, fill))
                .isEqualTo(-3);
        assertThat(jdbc.queryForObject("SELECT amount FROM cash_transactions WHERE fill_id = ?", BigDecimal.class, fill))
                .isEqualByComparingTo("60.00");
        assertThat(balance()).isEqualByComparingTo("1060.00");
        assertThat(jdbc.queryForObject("SELECT payload FROM audit_log WHERE event_type = ?", String.class,
                SettlementRecoveryService.COMPLETED)).contains("\"cashDelta\":60.00");
        assertThat(service.status(tradeFor(fill)).status()).isEqualTo("SETTLED");
    }

    private UUID order(String side, long quantity, String orderStatus) {
        UUID order = UUID.randomUUID();
        jdbc.update("INSERT INTO orders(order_id, account_id, instrument_id, side, quantity, status) VALUES (?, ?, ?, ?, ?, ?)",
                order, account, instrument, side, quantity, orderStatus);
        return order;
    }

    private void movement(UUID fill, String side, long quantity, String price) {
        jdbc.update("""
                INSERT INTO holding_movements(account_id, instrument_id, fill_id, quantity_change, cost_basis, movement_type)
                VALUES (?, ?, ?, ?, ?, ?)
                """, account, instrument, fill, "BUY".equals(side) ? quantity : -quantity, new BigDecimal(price), side);
    }

    private void cash(UUID fill, String side, String amount) {
        jdbc.update("INSERT INTO cash_transactions(account_id, fill_id, transaction_type, amount, currency, settlement_status, settled_at) "
                + "VALUES (?, ?, ?, ?, 'USD', 'SETTLED', CURRENT_TIMESTAMP)", account, fill, side, new BigDecimal(amount));
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

    private UUID tradeFor(UUID fill) {
        return jdbc.queryForObject("SELECT order_id FROM fills WHERE fill_id = ?", UUID.class, fill);
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
