package com.neueda.leap.order.execution;

import com.neueda.leap.order.execution.quote.ExecutionQuoteDecision;
import com.neueda.leap.order.execution.quote.ExecutionQuoteService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

/** Fills or rejects a locked order; settlement participates in the worker transaction. */
@Service
public class JdbcOrderExecutor implements OrderExecutor {
    private final JdbcTemplate jdbc;
    private final ExecutionQuoteService quotes;
    private final long maxAttempts;

    /**
     * Creates the execution handler.
     * @param jdbc transactional database access
     * @param quotes latest quote and freshness contract
     * @param maxAttempts maximum attempts for out-of-tolerance prices
     */
    public JdbcOrderExecutor(JdbcTemplate jdbc, ExecutionQuoteService quotes,
            @Value("${orders.execution.max-price-attempts:10}") long maxAttempts) {
        if (maxAttempts < 1) throw new IllegalArgumentException("Attempt limit must be positive");
        this.jdbc = jdbc;
        this.quotes = quotes;
        this.maxAttempts = maxAttempts;
    }

    /** Refuses startup when the required transactional holdings projection is absent. */
    @jakarta.annotation.PostConstruct
    public void requireHoldingsProjection() {
        Boolean ready = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = to_regclass('holding_movements')
                    AND tgname = 'tg_holding_movement_projection'
                    AND tgenabled IN ('O', 'A'))
                """, Boolean.class);
        if (!Boolean.TRUE.equals(ready)) {
            throw new IllegalStateException("Apply db/migrations/008_holdings_projection.sql before starting Orders");
        }
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Outcome execute(UUID orderId) {
        var order = jdbc.queryForObject("""
                SELECT account_id, instrument_id, side, quantity, execution_attempts, buffer_percent
                FROM orders WHERE order_id = ?
                """, (rs, n) -> new Trade(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
                rs.getString(3), rs.getLong(4), rs.getLong(5), rs.getBigDecimal(6)), orderId);
        if (order == null) throw new IllegalArgumentException("Order not found");

        Account account = requireExecutableAccount(orderId, order);
        if (account == null) return Outcome.REJECTED;

        QuoteContext quoteContext = selectExecutableQuote(orderId, order, account);
        if (quoteContext.outcome() != null) {
            return quoteContext.outcome();
        }
        boolean buy = Boolean.TRUE.equals(quoteContext.buy());

        BigDecimal cash = jdbc.query("SELECT balance FROM cash_balances WHERE account_id = ? FOR UPDATE",
                (rs, n) -> rs.getBigDecimal(1), order.account()).stream().findFirst().orElse(BigDecimal.ZERO);
        var position = jdbc.query("""
                SELECT quantity, avg_cost FROM holdings WHERE account_id = ? AND instrument_id = ? FOR UPDATE
                """, (rs, n) -> new Position(rs.getLong(1), rs.getBigDecimal(2)), order.account(), order.instrument())
                .stream().findFirst().orElse(new Position(0, BigDecimal.ZERO));
        BigDecimal amount = quoteContext.price().multiply(BigDecimal.valueOf(order.quantity())).setScale(2, RoundingMode.HALF_UP);
        Outcome fundsOutcome = validateSettlementPreconditions(orderId, account, position, buy, cash, amount, order.quantity());
        if (fundsOutcome != null) {
            return fundsOutcome;
        }

        SettlementResult settlement = persistSettlement(orderId, order, buy, quoteContext.price(), quoteContext.quote().quotedAt(), amount, cash);
        BigDecimal cashChange = settlement.cashChange();
        history(orderId, "FILLED", "EXECUTION_SUCCESS");
        jdbc.update("""
                INSERT INTO audit_log(account_id, related_order_id, actor_type, event_type, payload)
                SELECT ?, ?, 'SYSTEM', event_type,
                       jsonb_build_object('fillId', CAST(? AS uuid), 'quantity', CAST(? AS bigint),
                                          'executionPrice', CAST(? AS numeric), 'cashDelta', CAST(? AS numeric))
                FROM (VALUES ('ORDER_FILLED'), ('SETTLEMENT_COMPLETED')) events(event_type)
                """, order.account(), orderId, settlement.fillId(), order.quantity(), quoteContext.price(), cashChange);
        return Outcome.FILLED;
    }

    private Account requireExecutableAccount(UUID orderId, Trade order) {
        Account account = lockActiveAccountOrReject(orderId, order);
        if (account == null) {
            return null;
        }
        if (!isInstrumentTradable(order.instrument())) {
            reject(orderId, "INSTRUMENT_NOT_TRADABLE");
            return null;
        }
        return account;
    }

    private QuoteContext selectExecutableQuote(UUID orderId, Trade order, Account account) {
        var decision = quotes.selectForExecution(orderId);
        Outcome quoteOutcome = handleQuoteDecision(orderId, decision);
        if (quoteOutcome != null) {
            return new QuoteContext(null, null, null, quoteOutcome);
        }
        var quote = decision.quote();
        auditQuoteDecision(orderId, quote);
        boolean buy = "BUY".equals(order.side());
        BigDecimal price = buy ? quote.ask() : quote.bid();
        if (!isWithinTolerance(order, account, quote, buy, price)) {
            Outcome outcome = order.attempts() >= maxAttempts ? reject(orderId, "PRICE_OUT_OF_TOLERANCE") : Outcome.PENDING;
            return new QuoteContext(quote, buy, price, outcome);
        }
        return new QuoteContext(quote, buy, price, null);
    }

    private void auditQuoteDecision(UUID orderId, com.neueda.leap.marketdata.MarketQuote quote) {
        jdbc.update("""
                INSERT INTO audit_log(account_id, related_order_id, actor_type, event_type, payload)
                SELECT account_id, order_id, 'SYSTEM', 'PRICE_DECISION',
                       jsonb_build_object('quoteId', CAST(? AS uuid), 'quotedAt', CAST(? AS timestamptz),
                                          'bid', CAST(? AS numeric), 'ask', CAST(? AS numeric),
                                          'attemptNumber', execution_attempts) FROM orders WHERE order_id = ?
                """, quote.quoteId(), quote.quotedAt(), quote.bid(), quote.ask(), orderId);
    }

    private Outcome reject(UUID orderId, String reason) {
        jdbc.update("UPDATE orders SET status = 'REJECTED', last_execution_error = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?",
                reason, orderId);
        history(orderId, "REJECTED", reason);
        jdbc.update("""
                INSERT INTO audit_log(account_id, related_order_id, actor_type, event_type, payload)
                SELECT account_id, order_id, 'SYSTEM', 'ORDER_REJECTED',
                       jsonb_build_object('reasonCode', last_execution_error, 'attemptNumber', execution_attempts)
                FROM orders WHERE order_id = ?
                """, orderId);
        return Outcome.REJECTED;
    }

    private void history(UUID orderId, String status, String reason) {
        jdbc.update("INSERT INTO order_status_history(order_id, status, reason_code) VALUES (?, ?, ?)", orderId, status, reason);
    }

    private Account lockActiveAccountOrReject(UUID orderId, Trade order) {
        // Serialize all settlements for an account, including initially absent balance rows.
        var account = jdbc.queryForObject("""
                SELECT account_status, trading_enabled, execution_buffer_percent, min_balance_requirement
                FROM accounts WHERE account_id = ? FOR UPDATE
                """, (rs, n) -> new Account(rs.getString(1), rs.getBoolean(2), rs.getBigDecimal(3), rs.getBigDecimal(4)), order.account());
        if (account == null || !"ACTIVE".equals(account.status()) || !account.enabled()) {
            reject(orderId, "ACCOUNT_NOT_ACTIVE");
            return null;
        }
        return account;
    }

    private boolean isInstrumentTradable(UUID instrumentId) {
        Boolean tradable = jdbc.queryForObject(
                "SELECT enabled AND tradable FROM instruments WHERE instrument_id = ?",
                Boolean.class,
                instrumentId);
        return Boolean.TRUE.equals(tradable);
    }

    private Outcome handleQuoteDecision(UUID orderId, ExecutionQuoteDecision decision) {
        if (decision.action() == ExecutionQuoteDecision.Action.REQUEUE) {
            return Outcome.PENDING;
        }
        if (decision.action() == ExecutionQuoteDecision.Action.REJECT) {
            return reject(orderId, decision.reason().name());
        }
        return null;
    }

    private boolean isWithinTolerance(Trade order, Account account,
                                      com.neueda.leap.marketdata.MarketQuote quote,
                                      boolean buy, BigDecimal price) {
        BigDecimal buffer = resolveBuffer(order, account).movePointLeft(2);
        BigDecimal limit = quote.midpoint().multiply(buy ? BigDecimal.ONE.add(buffer) : BigDecimal.ONE.subtract(buffer));
        return buy ? price.compareTo(limit) <= 0 : price.compareTo(limit) >= 0;
    }

    private BigDecimal resolveBuffer(Trade order, Account account) {
        return order.buffer() == null ? account.buffer() : order.buffer();
    }

    private Outcome validateSettlementPreconditions(UUID orderId, Account account, Position position,
                                                    boolean buy, BigDecimal cash, BigDecimal amount,
                                                    long quantity) {
        if (cash.compareTo(account.minimum()) < 0) {
            return reject(orderId, "ACCOUNT_NOT_SUITABLE");
        }
        if (buy && cash.compareTo(amount) < 0) {
            return reject(orderId, "INSUFFICIENT_CASH");
        }
        if (!buy && position.quantity() < quantity) {
            return reject(orderId, "INSUFFICIENT_HOLDINGS");
        }
        return null;
    }

    private SettlementResult persistSettlement(UUID orderId, Trade order, boolean buy, BigDecimal price,
                                               java.time.OffsetDateTime quotedAt, BigDecimal amount, BigDecimal cash) {
        UUID fill = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO fills(fill_id, order_id, filled_quantity, execution_price, quote_timestamp)
                VALUES (?, ?, ?, ?, ?)
                """, fill, orderId, order.quantity(), price, quotedAt);
        long change = buy ? order.quantity() : -order.quantity();
        jdbc.update("""
                INSERT INTO holding_movements(account_id, instrument_id, fill_id, quantity_change, cost_basis, movement_type)
                VALUES (?, ?, ?, ?, ?, ?)
                """, order.account(), order.instrument(), fill, change, price, order.side());
        BigDecimal cashChange = buy ? amount.negate() : amount;
        jdbc.update("""
                INSERT INTO cash_transactions(account_id, fill_id, transaction_type, amount, currency, settlement_status, settled_at)
                VALUES (?, ?, ?, ?, 'USD', 'SETTLED', CURRENT_TIMESTAMP)
                """, order.account(), fill, order.side(), cashChange);

        // holding_movements invokes the transactional holdings projection trigger.
        jdbc.update("""
                INSERT INTO cash_balances(account_id, currency, balance) VALUES (?, 'USD', ?)
                ON CONFLICT (account_id) DO UPDATE SET balance = EXCLUDED.balance, updated_at = CURRENT_TIMESTAMP
                """, order.account(), cash.add(cashChange));
        return new SettlementResult(fill, cashChange);
    }

    private record Trade(UUID account, UUID instrument, String side, long quantity, long attempts, BigDecimal buffer) {}
    private record Account(String status, boolean enabled, BigDecimal buffer, BigDecimal minimum) {}
    private record Position(long quantity, BigDecimal cost) {}
    private record SettlementResult(UUID fillId, BigDecimal cashChange) {}
    private record QuoteContext(com.neueda.leap.marketdata.MarketQuote quote, Boolean buy, BigDecimal price, Outcome outcome) {}
}
