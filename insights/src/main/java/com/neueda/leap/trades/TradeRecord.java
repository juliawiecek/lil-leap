package com.neueda.leap.trades;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * One trade as the reporting dataset ({@code reports/trades.csv}) records it: the fill, the account
 * and client it belongs to, and every recorded step ({@code reports/trade-events.csv}). The dataset
 * holds filled orders only.
 *
 * @param orderId the trade's order id
 * @param filledAt execution time
 * @param symbol ticker symbol
 * @param instrumentName company name
 * @param side BUY or SELL
 * @param quantity shares filled
 * @param price execution price per share
 * @param value quantity times price, to the cent
 * @param account the account that placed it
 * @param events every recorded step, oldest first
 */
public record TradeRecord(UUID orderId, Instant filledAt, String symbol, String instrumentName, String side,
                          long quantity, BigDecimal price, BigDecimal value, Account account, List<Event> events) {

    /**
     * The account behind a trade, with its owner's name and email.
     *
     * @param accountId account identifier, which opens the account on the Clients page
     * @param accountNumber human-readable account number
     * @param accountName account label
     * @param clientName owner's first and last name
     * @param email owner's sign-in email
     * @param traderLevel NOVICE or ADVANCED
     * @param status account status
     */
    public record Account(UUID accountId, String accountNumber, String accountName, String clientName, String email,
                          String traderLevel, String status) {
    }

    /**
     * One recorded step in the trade's life.
     *
     * @param source where it was recorded: {@code STATUS}, {@code AUDIT}, {@code FILL}, {@code CASH} or {@code HOLDING}
     * @param type the status, audit event type, or movement type
     * @param actor who caused it ({@code SYSTEM}) where recorded, else null
     * @param occurredAt when it was recorded
     * @param details the record's own fields, e.g. reason code, price or amount
     */
    public record Event(String source, String type, String actor, Instant occurredAt, Map<String, Object> details) {
    }
}
