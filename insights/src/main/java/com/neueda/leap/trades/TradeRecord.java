package com.neueda.leap.trades;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One trade as the reporting dataset ({@code reports/trades.csv}) records it: the fill and the account
 * and client it belongs to. The dataset holds filled orders only.
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
 */
public record TradeRecord(UUID orderId, Instant filledAt, String symbol, String instrumentName, String side,
                          long quantity, BigDecimal price, BigDecimal value, Account account) {

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
}
