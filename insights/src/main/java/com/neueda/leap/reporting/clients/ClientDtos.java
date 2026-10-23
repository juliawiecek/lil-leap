package com.neueda.leap.reporting.clients;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Response shapes of the Clients endpoints, built from the fills on the reporting replica.
 * Accounts carry their owner's name and email so analysts can tell who a client is; the owning user's
 * id is never returned.
 */
public final class ClientDtos {

    private ClientDtos() {
    }

    /**
     * One trading account in the list, or the summary at the top of its detail page.
     *
     * @param accountId account identifier, used in the detail URL
     * @param accountNumber human-readable account number
     * @param accountName account label
     * @param clientName owner's first and last name
     * @param email owner's sign-in email
     * @param traderLevel NOVICE or ADVANCED
     * @param status PENDING, ACTIVE, BLOCKED or CLOSED
     * @param tradeCount number of fills
     * @param tradedValue total value of the fills in USD, to the cent
     * @param lastTradeAt time of the latest fill
     */
    public record ClientSummary(UUID accountId, String accountNumber, String accountName, String clientName,
                                String email, String traderLevel, String status, long tradeCount,
                                BigDecimal tradedValue, Instant lastTradeAt) {
    }

    /**
     * A stock the account holds, worked out from its buys and sells.
     *
     * @param symbol ticker symbol
     * @param instrumentName company name
     * @param quantity shares held
     * @param averageCost average cost per share of the shares still held
     * @param costBasis quantity times average cost, to the cent
     */
    public record Holding(String symbol, String instrumentName, long quantity, BigDecimal averageCost, BigDecimal costBasis) {
    }

    /**
     * One of the account's filled orders.
     *
     * @param orderId order identifier, which opens the order in Trade lookup
     * @param filledAt execution time
     * @param symbol ticker symbol
     * @param side BUY or SELL
     * @param quantity shares filled
     * @param fillPrice execution price
     */
    public record Order(UUID orderId, Instant filledAt, String symbol, String side, long quantity, BigDecimal fillPrice) {
    }

    /**
     * An account's detail page: its summary and holdings. Orders are paged separately.
     *
     * @param account the account summary
     * @param holdings positions with a non-zero quantity, by symbol
     */
    public record ClientDetail(ClientSummary account, List<Holding> holdings) {
    }

    /**
     * One page of results.
     *
     * @param content the rows on this page
     * @param page zero-based page number
     * @param size page size requested
     * @param totalElements rows across all pages
     * @param totalPages number of pages
     * @param <T> row type
     */
    public record Page<T>(List<T> content, int page, int size, long totalElements, int totalPages) {

        /**
         * Builds a page, deriving the page count.
         *
         * @param content the rows on this page
         * @param page zero-based page number
         * @param size page size requested
         * @param total rows across all pages
         * @param <T> row type
         * @return the page
         */
        public static <T> Page<T> of(List<T> content, int page, int size, long total) {
            return new Page<>(content, page, size, total, (int) ((total + size - 1) / size));
        }

        /**
         * Cuts one page out of a full, already ordered list.
         *
         * @param all every row, in display order
         * @param page zero-based page number
         * @param size page size
         * @param <T> row type
         * @return the page
         */
        public static <T> Page<T> slice(List<T> all, int page, int size) {
            int from = (int) Math.min((long) page * size, all.size());
            return of(List.copyOf(all.subList(from, Math.min(from + size, all.size()))), page, size, all.size());
        }
    }
}
