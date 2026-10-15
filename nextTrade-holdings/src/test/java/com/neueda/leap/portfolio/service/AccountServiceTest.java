package com.neueda.leap.portfolio.service;

import com.neueda.leap.portfolio.dto.TransferRequest;
import com.neueda.leap.portfolio.service.AccountActionException.Reason;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Rejection rules for opening accounts and transfers; the SQL itself is covered by AccountTransferPostgresTest. */
class AccountServiceTest {

    private final UUID userId = UUID.randomUUID();
    private final UUID from = UUID.randomUUID();
    private final UUID to = UUID.randomUUID();
    private JdbcTemplate jdbc;
    private AccountService service;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        service = new AccountService(jdbc);
    }

    @Test
    void sameAccountTwiceIsRejectedBeforeAnyLock() {
        assertRejected(new TransferRequest(from, from, BigDecimal.TEN), Reason.SAME_ACCOUNT);
        verify(jdbc, never()).query(anyString(), any(RowMapper.class), any(Object[].class));
    }

    @Test
    void anAccountTheCallerDoesNotOwnIsDenied() {
        lockedStatuses(List.of("ACTIVE"));
        assertRejected(new TransferRequest(from, to, BigDecimal.TEN), Reason.ACCOUNT_ACCESS_DENIED);
    }

    @Test
    void aClosedOrBlockedAccountCannotSendOrReceive() {
        lockedStatuses(List.of("ACTIVE", "CLOSED"));
        assertRejected(new TransferRequest(from, to, BigDecimal.TEN), Reason.ACCOUNT_UNAVAILABLE);
    }

    @Test
    void moreThanTheSettledAvailableCashIsRejectedWithoutWriting() {
        lockedStatuses(List.of("ACTIVE", "PENDING"));
        when(jdbc.queryForObject(anyString(), eq(BigDecimal.class), eq(from), eq(from))).thenReturn(new BigDecimal("9.99"));
        assertRejected(new TransferRequest(from, to, BigDecimal.TEN), Reason.INSUFFICIENT_FUNDS);
        verify(jdbc, never()).update(contains("cash_transactions"), any(Object[].class));
    }

    @Test
    void openingIsRefusedAtTheAccountLimit() {
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq(userId))).thenReturn(AccountService.MAX_ACCOUNTS);
        assertThatThrownBy(() -> service.open(userId, "One too many"))
                .isInstanceOfSatisfying(AccountActionException.class, e -> assertThat(e.reason()).isEqualTo(Reason.ACCOUNT_LIMIT_REACHED));
        verify(jdbc, never()).queryForMap(anyString(), any(Object[].class));
    }

    @Test
    void aFirstAccountDefaultsToTheNoviceTierAndStartsEmpty() {
        UUID created = UUID.randomUUID();
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq(userId))).thenReturn(0);
        when(jdbc.queryForList(anyString(), eq(userId))).thenReturn(List.of());
        when(jdbc.queryForMap(anyString(), any(Object[].class)))
                .thenReturn(Map.of("account_id", created, "created_at", Timestamp.from(Instant.EPOCH)));

        var account = service.open(userId, "  Savings  ");

        assertThat(account.accountId()).isEqualTo(created);
        assertThat(account.nickname()).isEqualTo("Savings");
        assertThat(account.cashBalance()).isEqualByComparingTo("0");
        assertThat(account.createdAt()).isEqualTo(Instant.EPOCH);
        verify(jdbc).queryForMap(anyString(), eq(userId), anyString(), eq("Savings"), eq("INDIVIDUAL_CASH"), eq("ACTIVE"),
                eq("NOVICE"), eq(new BigDecimal("5000.00")));
        verify(jdbc).update(contains("audit_log"), eq(userId), eq(created), eq("ACCOUNT_OPENED"), anyString());
    }

    @Test
    @SuppressWarnings("unchecked")
    void aTransferWritesBothLedgerRowsMovesBothBalancesAndAudits() {
        lockedStatuses(List.of("ACTIVE", "ACTIVE"));
        when(jdbc.queryForObject(anyString(), eq(BigDecimal.class), eq(from), eq(from))).thenReturn(new BigDecimal("100.00"));
        when(jdbc.query(contains("UPDATE cash_balances"), any(RowMapper.class), eq(new BigDecimal("-25.00")), eq(from)))
                .thenReturn(List.of(new BigDecimal("75.00")));
        // The target has no cached balance yet, so it is seeded from its ledger.
        when(jdbc.query(contains("UPDATE cash_balances"), any(RowMapper.class), eq(new BigDecimal("25.00")), eq(to)))
                .thenReturn(List.of());
        when(jdbc.queryForObject(contains("INSERT INTO cash_balances"), eq(BigDecimal.class), eq(to), eq(to)))
                .thenReturn(new BigDecimal("25.00"));

        var result = service.transfer(userId, new TransferRequest(from, to, new BigDecimal("25")));

        assertThat(result.amount()).isEqualByComparingTo("25.00");
        assertThat(result.fromBalance()).isEqualByComparingTo("75.00");
        assertThat(result.toBalance()).isEqualByComparingTo("25.00");
        verify(jdbc).update(contains("cash_transactions"), eq(from), eq(new BigDecimal("-25.00")));
        verify(jdbc).update(contains("cash_transactions"), eq(to), eq(new BigDecimal("25.00")));
        verify(jdbc).update(contains("audit_log"), eq(userId), eq(from), eq("CASH_TRANSFER"), contains("\"amount\":\"25.00\""));
    }

    @Test
    void listingIsScopedToTheCaller() {
        when(jdbc.queryForList(anyString(), eq(userId))).thenReturn(List.of(Map.of("account_id", from)));
        assertThat(service.list(userId)).containsExactly(Map.of("account_id", from));
    }

    @SuppressWarnings("unchecked")
    private void lockedStatuses(List<String> statuses) {
        when(jdbc.query(contains("FOR UPDATE"), any(RowMapper.class), eq(from), eq(to), eq(userId))).thenReturn(statuses);
    }

    private void assertRejected(TransferRequest request, Reason reason) {
        assertThatThrownBy(() -> service.transfer(userId, request))
                .isInstanceOfSatisfying(AccountActionException.class, e -> assertThat(e.reason()).isEqualTo(reason));
    }
}
