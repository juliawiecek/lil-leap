package com.neueda.leap.reporting.service;

import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The fills in {@code reports/trades.csv}, the standalone dataset the Reports and Clients pages read
 * so they never compete with live trading for database capacity.
 */
@Component
public class TradeDataset {

    private static final String RESOURCE_PATH = "classpath:reports/trades.csv";
    private static final String NAME = "Reporting dataset";

    private static final List<String> HEADERS = List.of(
            "fill_id",
            "order_id",
            "filled_at",
            "instrument_id",
            "instrument_symbol",
            "instrument_name",
            "asset_class",
            "market_code",
            "user_id",
            "client_email",
            "client_name",
            "account_id",
            "account_number",
            "account_name",
            "account_status",
            "trader_level",
            "side",
            "filled_quantity",
            "execution_price");

    private final ResourceLoader resourceLoader;

    /**
     * Creates the dataset reader.
     *
     * @param resourceLoader classpath resource loader used to read the CSV
     */
    public TradeDataset(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
    }

    /**
     * Reads every fill in the dataset, in file order.
     *
     * @return the fills
     * @throws IllegalStateException when the file is missing, unreadable or malformed
     */
    public List<Trade> trades() {
        Resource resource = resourceLoader.getResource(RESOURCE_PATH);
        if (!resource.exists()) {
            throw new IllegalStateException(NAME + " not found: " + RESOURCE_PATH);
        }

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            String headerLine = reader.readLine();
            if (headerLine == null) {
                throw new IllegalStateException(NAME + " is empty: " + RESOURCE_PATH);
            }

            List<String> actualHeaders = parseCsvLine(headerLine);
            if (!HEADERS.equals(actualHeaders)) {
                throw new IllegalStateException("Unexpected " + NAME.toLowerCase(Locale.ROOT) + " header: " + actualHeaders);
            }

            List<Trade> trades = new ArrayList<>();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }

                List<String> columns = parseCsvLine(line);
                if (columns.size() != HEADERS.size()) {
                    throw new IllegalStateException("Unexpected column count in " + NAME.toLowerCase(Locale.ROOT) + " row: " + columns);
                }

                trades.add(trade(columns));
            }

            return trades;
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read " + NAME.toLowerCase(Locale.ROOT) + " from " + RESOURCE_PATH, ex);
        }
    }

    private static Trade trade(List<String> columns) {
        return new Trade(
                columns.get(0),
                columns.get(1),
                Instant.parse(columns.get(2)),
                columns.get(3),
                columns.get(4),
                columns.get(5),
                columns.get(6),
                columns.get(7),
                columns.get(8),
                columns.get(9),
                columns.get(10),
                columns.get(11),
                columns.get(12),
                columns.get(13),
                columns.get(14),
                columns.get(15),
                columns.get(16),
                Long.parseLong(columns.get(17)),
                new BigDecimal(columns.get(18)));
    }

    /** Splits one CSV line, honouring quoted fields and doubled quotes; shared with {@link TradeEventDataset}. */
    static List<String> parseCsvLine(String line) {
        List<String> values = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean[] inQuotes = {false};

        int index = 0;
        while (index < line.length()) {
            index = consumeCsvCharacter(line, index, values, current, inQuotes);
        }

        values.add(current.toString());
        return values;
    }

    private static boolean isEscapedQuote(String line, int index) {
        return line.charAt(index) == '"' && index + 1 < line.length() && line.charAt(index + 1) == '"';
    }

    private static int consumeCsvCharacter(String line, int index, List<String> values, StringBuilder current, boolean[] inQuotes) {
        char character = line.charAt(index);
        if (inQuotes[0]) {
            if (isEscapedQuote(line, index)) {
                current.append('"');
                return index + 2;
            }
            if (character == '"') {
                inQuotes[0] = false;
            } else {
                current.append(character);
            }
            return index + 1;
        }

        if (character == ',') {
            values.add(current.toString());
            current.setLength(0);
            return index + 1;
        }
        if (character == '"') {
            inQuotes[0] = true;
            return index + 1;
        }
        current.append(character);
        return index + 1;
    }

    /**
     * One fill in the dataset.
     *
     * @param fillId fill identifier
     * @param orderId the order it filled
     * @param filledAt execution time
     * @param instrumentId instrument identifier
     * @param instrumentSymbol ticker symbol
     * @param instrumentName company name
     * @param assetClass instrument class
     * @param marketCode listing market
     * @param userId owning user
     * @param clientEmail owner's sign-in email
     * @param clientName owner's first and last name
     * @param accountId trading account identifier
     * @param accountNumber human-readable account number
     * @param accountName account label
     * @param accountStatus account status
     * @param traderLevel NOVICE or ADVANCED
     * @param side BUY or SELL
     * @param filledQuantity shares filled
     * @param executionPrice price per share
     */
    public record Trade(
            String fillId,
            String orderId,
            Instant filledAt,
            String instrumentId,
            String instrumentSymbol,
            String instrumentName,
            String assetClass,
            String marketCode,
            String userId,
            String clientEmail,
            String clientName,
            String accountId,
            String accountNumber,
            String accountName,
            String accountStatus,
            String traderLevel,
            String side,
            long filledQuantity,
            BigDecimal executionPrice) {

        /**
         * Traded value of the fill.
         *
         * @return quantity times execution price
         */
        public BigDecimal notional() {
            return executionPrice.multiply(BigDecimal.valueOf(filledQuantity));
        }
    }
}
