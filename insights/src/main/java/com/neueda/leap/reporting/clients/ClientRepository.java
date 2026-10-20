package com.neueda.leap.reporting.clients;

import com.neueda.leap.reporting.service.TradeDataset;
import com.neueda.leap.reporting.service.TradeDataset.Trade;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Predicate;

/**
 * Trading accounts, their holdings and filled orders, worked out from the reporting dataset
 * ({@code reports/trades.csv}), the same file the Reports page reads. An account appears once it has a fill.
 */
@Repository
public class ClientRepository {

    private final TradeDataset dataset;

    /**
     * Creates the repository.
     *
     * @param dataset the reporting dataset
     */
    public ClientRepository(TradeDataset dataset) {
        this.dataset = dataset;
    }

    /**
     * Lists accounts matching the query, one page at a time.
     *
     * @param query validated filters, sort and page
     * @return the page of accounts
     */
    public ClientDtos.Page<ClientDtos.ClientSummary> list(ClientQuery query) {
        List<Trade> trades = dataset.trades();
        List<ClientDtos.ClientSummary> matches = summaries(trades).stream()
                .filter(account -> query.level() == null || query.level().equals(account.traderLevel()))
                .filter(account -> query.status() == null || query.status().equals(account.status()))
                .filter(searchFilter(query.search(), trades))
                .sorted(order(query.sort(), query.descending()))
                .toList();
        return ClientDtos.Page.slice(matches, query.page(), query.size());
    }

    /**
     * Reads one account's summary.
     *
     * @param accountId the account
     * @return the summary, or empty when the dataset has no fills for it
     */
    public Optional<ClientDtos.ClientSummary> summary(UUID accountId) {
        return summaries(dataset.trades()).stream().filter(account -> account.accountId().equals(accountId)).findFirst();
    }

    /**
     * Works out the stocks an account holds from its fills, oldest first: buys add shares at their price,
     * sells remove shares at the average cost.
     *
     * @param accountId the account
     * @return positions with a quantity above zero, by symbol
     */
    public List<ClientDtos.Holding> holdings(UUID accountId) {
        Map<String, Position> positions = new TreeMap<>();
        fills(accountId).stream()
                .sorted(Comparator.comparing(Trade::filledAt).thenComparing(Trade::orderId))
                .forEach(trade -> positions.computeIfAbsent(trade.instrumentSymbol(), symbol -> new Position(trade.instrumentName()))
                        .apply(trade));
        return positions.entrySet().stream()
                .filter(entry -> entry.getValue().quantity > 0)
                .map(entry -> entry.getValue().holding(entry.getKey()))
                .toList();
    }

    /**
     * Lists an account's filled orders, newest first.
     *
     * @param accountId the account
     * @param search a symbol prefix or a full order ID, or null for all
     * @param page zero-based page number
     * @param size page size
     * @return the page of orders
     */
    public ClientDtos.Page<ClientDtos.Order> orders(UUID accountId, String search, int page, int size) {
        UUID orderId = search == null ? null : uuid(search);
        String symbol = search == null ? null : search.toUpperCase(Locale.ROOT);
        List<ClientDtos.Order> orders = fills(accountId).stream()
                .filter(trade -> search == null || (orderId != null
                        ? orderId.toString().equals(trade.orderId())
                        : trade.instrumentSymbol().toUpperCase(Locale.ROOT).startsWith(symbol)))
                .sorted(Comparator.comparing(Trade::filledAt).reversed().thenComparing(Trade::orderId))
                .map(trade -> new ClientDtos.Order(UUID.fromString(trade.orderId()), trade.filledAt(),
                        trade.instrumentSymbol(), trade.side(), trade.filledQuantity(), trade.executionPrice()))
                .toList();
        return ClientDtos.Page.slice(orders, page, size);
    }

    /** One summary per account, from its fills; identity and status come from its latest fill. */
    private static List<ClientDtos.ClientSummary> summaries(List<Trade> trades) {
        Map<String, List<Trade>> byAccount = new LinkedHashMap<>();
        for (Trade trade : trades) {
            byAccount.computeIfAbsent(trade.accountId(), id -> new ArrayList<>()).add(trade);
        }
        return byAccount.values().stream().map(ClientRepository::summary).toList();
    }

    private static ClientDtos.ClientSummary summary(List<Trade> fills) {
        Trade latest = fills.stream().max(Comparator.comparing(Trade::filledAt)).orElseThrow();
        BigDecimal value = fills.stream().map(Trade::notional).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new ClientDtos.ClientSummary(UUID.fromString(latest.accountId()), latest.accountNumber(),
                latest.accountName(), latest.clientName(), latest.clientEmail(), latest.traderLevel(),
                latest.accountStatus(), fills.size(), value.setScale(2, RoundingMode.HALF_UP), latest.filledAt());
    }

    private List<Trade> fills(UUID accountId) {
        String id = accountId.toString();
        return dataset.trades().stream().filter(trade -> trade.accountId().equals(id)).toList();
    }

    /** No search matches every account; a full ID finds its account; other text matches as {@link #matches}. */
    private static Predicate<ClientDtos.ClientSummary> searchFilter(String search, List<Trade> trades) {
        if (search == null) {
            return account -> true;
        }
        UUID id = uuid(search);
        if (id != null) {
            return account -> owns(trades, account.accountId(), id);
        }
        String text = search.toLowerCase(Locale.ROOT);
        return account -> matches(account, text);
    }

    /** A pasted ID matches the account itself or one of its orders. */
    private static boolean owns(List<Trade> trades, UUID accountId, UUID id) {
        String order = id.toString();
        return accountId.equals(id) || trades.stream()
                .anyMatch(trade -> trade.orderId().equals(order) && trade.accountId().equals(accountId.toString()));
    }

    private static boolean matches(ClientDtos.ClientSummary account, String text) {
        return contains(account.accountNumber(), text) || contains(account.accountName(), text)
                || contains(account.clientName(), text) || contains(account.email(), text);
    }

    private static boolean contains(String value, String text) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(text);
    }

    /** Orders by the sort key, missing values last in either direction, then by account number. */
    private static Comparator<ClientDtos.ClientSummary> order(String sort, boolean descending) {
        Comparator<ClientDtos.ClientSummary> primary = switch (sort) {
            case "accountName" -> by(ClientDtos.ClientSummary::accountName, descending);
            case "clientName" -> by(ClientDtos.ClientSummary::clientName, descending);
            case "email" -> by(ClientDtos.ClientSummary::email, descending);
            case "traderLevel" -> by(ClientDtos.ClientSummary::traderLevel, descending);
            case "status" -> by(ClientDtos.ClientSummary::status, descending);
            case "tradeCount" -> by(ClientDtos.ClientSummary::tradeCount, descending);
            case "tradedValue" -> by(ClientDtos.ClientSummary::tradedValue, descending);
            case "lastTradeAt" -> by(ClientDtos.ClientSummary::lastTradeAt, descending);
            default -> by(ClientDtos.ClientSummary::accountNumber, descending);
        };
        return primary.thenComparing(ClientDtos.ClientSummary::accountNumber);
    }

    private static <T extends Comparable<? super T>> Comparator<ClientDtos.ClientSummary> by(
            Function<ClientDtos.ClientSummary, T> key, boolean descending) {
        return Comparator.comparing(key, Comparator.nullsLast(descending ? Comparator.<T>reverseOrder() : Comparator.<T>naturalOrder()));
    }

    private static UUID uuid(String value) {
        try {
            return value.length() == 36 ? UUID.fromString(value) : null;
        } catch (IllegalArgumentException notAnId) {
            return null;
        }
    }

    /** Shares of one stock and their average cost while the fills are replayed. */
    private static final class Position {

        private final String instrumentName;
        private long quantity;
        private BigDecimal averageCost = BigDecimal.ZERO;

        private Position(String instrumentName) {
            this.instrumentName = instrumentName;
        }

        private void apply(Trade trade) {
            if ("BUY".equals(trade.side())) {
                long held = quantity + trade.filledQuantity();
                if (held > 0) {
                    averageCost = averageCost.multiply(BigDecimal.valueOf(quantity)).add(trade.notional())
                            .divide(BigDecimal.valueOf(held), 8, RoundingMode.HALF_UP);
                }
                quantity = held;
            } else {
                quantity = Math.max(0, quantity - trade.filledQuantity());
                if (quantity == 0) {
                    averageCost = BigDecimal.ZERO;
                }
            }
        }

        private ClientDtos.Holding holding(String symbol) {
            return new ClientDtos.Holding(symbol, instrumentName, quantity, averageCost.setScale(4, RoundingMode.HALF_UP),
                    averageCost.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP));
        }
    }
}
