package com.neueda.leap.portfolio.service;

import com.neueda.leap.portfolio.dto.AccountResponse;
import com.neueda.leap.portfolio.dto.TransferRequest;
import com.neueda.leap.portfolio.dto.TransferResponse;
import com.neueda.leap.portfolio.service.AccountActionException.Reason;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Lists, opens and moves cash between the caller's own accounts (PS-05, BR-02).
 *
 * <p>Every statement is scoped by the user id from the validated JWT. A transfer locks both
 * account rows -- the lock the orders service takes before it moves cash -- in id order, so
 * concurrent transfers and fills on the same accounts run one after another.</p>
 */
@Service
public class AccountService {

    /** Most accounts one client may hold; keeps a scripted client from opening accounts without limit. */
    static final int MAX_ACCOUNTS = 10;
    private static final String ACCOUNT_TYPE = "INDIVIDUAL_CASH";
    private static final String CURRENCY = "USD";
    private static final String ACTIVE = "ACTIVE";
    private static final Set<String> CLOSED_STATUSES = Set.of("BLOCKED", "CLOSED");
    private static final String DEFAULT_TRADER_LEVEL = "NOVICE";
    private static final BigDecimal DEFAULT_MIN_BALANCE = new BigDecimal("5000.00");

    private static final String LIST_SQL = """
            SELECT a.account_id, a.account_number, a.account_name, a.account_type, a.account_status,
                   a.trader_level, a.trading_enabled, a.created_at, 'USD' AS currency,
                   COALESCE((SELECT SUM(ct.amount) FROM cash_transactions ct
                             WHERE ct.account_id = a.account_id AND ct.settlement_status = 'SETTLED'), 0)
                     - COALESCE((SELECT SUM(h.held_amount) FROM cash_holds h
                                 WHERE h.account_id = a.account_id AND h.released_at IS NULL), 0) AS available_cash
            FROM accounts a WHERE a.user_id = ?
            ORDER BY a.created_at, a.account_number
            """;
    private static final String AVAILABLE_CASH_SQL = """
            SELECT COALESCE((SELECT SUM(amount) FROM cash_transactions
                             WHERE account_id = ? AND settlement_status = 'SETTLED'), 0)
                 - COALESCE((SELECT SUM(held_amount) FROM cash_holds
                             WHERE account_id = ? AND released_at IS NULL), 0)
            """;
    private static final String INSERT_ACCOUNT_SQL = """
            INSERT INTO accounts(user_id, account_number, account_name, account_type, account_status,
                                 trader_level, min_balance_requirement, trading_enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
            RETURNING account_id, created_at
            """;
    private static final String AUDIT_SQL = """
            INSERT INTO audit_log(user_id, account_id, actor_type, event_type, payload)
            VALUES (?, ?, 'USER', ?, CAST(? AS jsonb))
            """;

    private final JdbcTemplate jdbc;

    /**
     * Creates the account service.
     * @param jdbc primary database access
     */
    public AccountService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Lists the caller's accounts, oldest first, with settled cash that is free to move or trade.
     * @param userId identity from the validated JWT
     * @return owned accounts, or an empty list
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(UUID userId) {
        return jdbc.queryForList(LIST_SQL, userId);
    }

    /**
     * Opens an ACTIVE individual cash account in USD with no cash, holdings or orders, and records
     * an ACCOUNT_OPENED audit event. The new account takes the tier of the client's existing accounts.
     * @param userId identity from the validated JWT
     * @param nickname validated display name
     * @return the new account
     * @throws AccountActionException when the client already holds {@link #MAX_ACCOUNTS} accounts
     */
    @Transactional
    public AccountResponse open(UUID userId, String nickname) {
        String name = nickname.trim();
        // Locking the client row serializes concurrent opens, so the limit cannot be overshot.
        jdbc.query("SELECT user_id FROM users WHERE user_id = ? FOR UPDATE", (rs, row) -> rs.getObject(1), userId);
        Integer existing = jdbc.queryForObject("SELECT COUNT(*) FROM accounts WHERE user_id = ?", Integer.class, userId);
        if (existing != null && existing >= MAX_ACCOUNTS) {
            throw new AccountActionException(Reason.ACCOUNT_LIMIT_REACHED);
        }
        Map<String, Object> tier = jdbc.queryForList("""
                SELECT trader_level, min_balance_requirement FROM accounts
                WHERE user_id = ? ORDER BY created_at, account_number LIMIT 1
                """, userId).stream().findFirst()
                .orElse(Map.of("trader_level", DEFAULT_TRADER_LEVEL, "min_balance_requirement", DEFAULT_MIN_BALANCE));
        String accountNumber = newAccountNumber();
        Map<String, Object> created = jdbc.queryForMap(INSERT_ACCOUNT_SQL, userId, accountNumber, name, ACCOUNT_TYPE,
                ACTIVE, tier.get("trader_level"), tier.get("min_balance_requirement"));
        UUID accountId = (UUID) created.get("account_id");
        jdbc.update("INSERT INTO cash_balances(account_id, currency, balance) VALUES (?, 'USD', 0)", accountId);
        audit(userId, accountId, "ACCOUNT_OPENED", "{\"accountNumber\":\"%s\",\"accountType\":\"%s\",\"currency\":\"%s\"}"
                .formatted(accountNumber, ACCOUNT_TYPE, CURRENCY));
        return new AccountResponse(accountId, accountNumber, name, ACCOUNT_TYPE, CURRENCY, ACTIVE, true,
                BigDecimal.ZERO.setScale(2, RoundingMode.UNNECESSARY), toInstant(created.get("created_at")));
    }

    /**
     * Moves settled cash between two of the caller's accounts in one transaction: a negative and a
     * positive TRANSFER ledger row, both cached balances, and one CASH_TRANSFER audit event.
     * @param userId identity from the validated JWT
     * @param request validated source, target and amount
     * @return both balances after the transfer
     * @throws AccountActionException when the accounts are the same, not both the caller's, not open,
     *         or the source would go below zero
     */
    @Transactional
    public TransferResponse transfer(UUID userId, TransferRequest request) {
        UUID from = request.fromAccountId();
        UUID to = request.toAccountId();
        if (from.equals(to)) {
            throw new AccountActionException(Reason.SAME_ACCOUNT);
        }
        List<String> statuses = jdbc.query("""
                SELECT account_status FROM accounts
                WHERE account_id IN (?, ?) AND user_id = ?
                ORDER BY account_id FOR UPDATE
                """, (rs, row) -> rs.getString(1), from, to, userId);
        if (statuses.size() != 2) {
            throw new AccountActionException(Reason.ACCOUNT_ACCESS_DENIED);
        }
        if (statuses.stream().anyMatch(CLOSED_STATUSES::contains)) {
            throw new AccountActionException(Reason.ACCOUNT_UNAVAILABLE);
        }
        // Validation allows at most two decimals, so this never rounds.
        BigDecimal amount = request.amount().setScale(2, RoundingMode.UNNECESSARY);
        BigDecimal available = jdbc.queryForObject(AVAILABLE_CASH_SQL, BigDecimal.class, from, from);
        if (available == null || available.compareTo(amount) < 0) {
            throw new AccountActionException(Reason.INSUFFICIENT_FUNDS);
        }
        BigDecimal fromBalance = move(from, amount.negate());
        BigDecimal toBalance = move(to, amount);
        UUID transferId = UUID.randomUUID();
        audit(userId, from, "CASH_TRANSFER",
                "{\"transferId\":\"%s\",\"fromAccountId\":\"%s\",\"toAccountId\":\"%s\",\"amount\":\"%s\",\"currency\":\"%s\"}"
                        .formatted(transferId, from, to, amount.toPlainString(), CURRENCY));
        return new TransferResponse(transferId, from, to, amount, fromBalance, toBalance, Instant.now());
    }

    /** Appends one ledger row and moves the cached balance with it; the ledger stays authoritative. */
    private BigDecimal move(UUID accountId, BigDecimal change) {
        jdbc.update("""
                INSERT INTO cash_transactions(account_id, transaction_type, amount, currency, settlement_status, settled_at)
                VALUES (?, 'TRANSFER', ?, 'USD', 'SETTLED', CURRENT_TIMESTAMP)
                """, accountId, change);
        List<BigDecimal> updated = jdbc.query("""
                UPDATE cash_balances SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
                WHERE account_id = ? RETURNING balance
                """, (rs, row) -> rs.getBigDecimal(1), change, accountId);
        if (!updated.isEmpty()) {
            return updated.get(0);
        }
        // No cached row yet: seed it from the ledger, which now includes this transfer.
        return jdbc.queryForObject("""
                INSERT INTO cash_balances(account_id, currency, balance)
                SELECT ?, 'USD', COALESCE(SUM(amount), 0) FROM cash_transactions WHERE account_id = ?
                RETURNING balance
                """, BigDecimal.class, accountId, accountId);
    }

    private void audit(UUID userId, UUID accountId, String eventType, String payload) {
        jdbc.update(AUDIT_SQL, userId, accountId, eventType, payload);
    }

    private static String newAccountNumber() {
        return "NT" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase(Locale.ROOT);
    }

    private static Instant toInstant(Object value) {
        if (value instanceof java.sql.Timestamp timestamp) {
            return timestamp.toInstant();
        }
        if (value instanceof java.time.OffsetDateTime offset) {
            return offset.toInstant();
        }
        return Instant.now();
    }
}
