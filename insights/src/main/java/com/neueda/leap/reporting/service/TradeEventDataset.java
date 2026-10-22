package com.neueda.leap.reporting.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Every recorded step of the fills in {@code reports/trades.csv}, from {@code reports/trade-events.csv}:
 * status changes, audit entries, the fill and its cash and holding movements, as the seed writes them
 * to the database. Generated with trades.csv by {@code db/seeds/generate_demo_trades.py}.
 */
@Component
public class TradeEventDataset {

    private static final String RESOURCE_PATH = "classpath:reports/trade-events.csv";
    private static final List<String> HEADERS = List.of("order_id", "occurred_at", "source", "type", "actor", "details");
    private static final TypeReference<LinkedHashMap<String, Object>> DETAILS = new TypeReference<>() {
    };

    private final ResourceLoader resourceLoader;
    private final ObjectMapper json = new ObjectMapper();

    /**
     * Creates the reader.
     *
     * @param resourceLoader classpath resource loader used to read the CSV
     */
    public TradeEventDataset(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
    }

    /**
     * Reads one order's steps in file order, which is oldest first.
     *
     * @param orderId the order, as written in the dataset
     * @return its steps, empty when the dataset has none
     * @throws IllegalStateException when the file is missing, unreadable or malformed
     */
    public List<Event> events(String orderId) {
        Resource resource = resourceLoader.getResource(RESOURCE_PATH);
        if (!resource.exists()) {
            throw new IllegalStateException("Trade events dataset not found: " + RESOURCE_PATH);
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            String header = reader.readLine();
            if (header == null || !HEADERS.equals(TradeDataset.parseCsvLine(header))) {
                throw new IllegalStateException("Unexpected trade events dataset header: " + header);
            }
            // Every row starts with its order id, so only that order's rows are parsed.
            String prefix = orderId + ",";
            List<Event> events = new ArrayList<>();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.regionMatches(true, 0, prefix, 0, prefix.length())) {
                    events.add(event(TradeDataset.parseCsvLine(line)));
                }
            }
            return events;
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read trade events dataset from " + RESOURCE_PATH, ex);
        }
    }

    private Event event(List<String> columns) {
        if (columns.size() != HEADERS.size()) {
            throw new IllegalStateException("Unexpected column count in trade events dataset row: " + columns);
        }
        try {
            Map<String, Object> details = columns.get(5).isEmpty() ? Map.of() : json.readValue(columns.get(5), DETAILS);
            return new Event(columns.get(0), Instant.parse(columns.get(1)), columns.get(2), columns.get(3),
                    columns.get(4).isEmpty() ? null : columns.get(4), details);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Unreadable details in trade events dataset row: " + columns, ex);
        }
    }

    /**
     * One recorded step.
     *
     * @param orderId the order it belongs to
     * @param occurredAt when it was recorded
     * @param source STATUS, AUDIT, FILL, CASH or HOLDING
     * @param type the status, audit event type, or movement type
     * @param actor who caused it (SYSTEM) where recorded, else null
     * @param details the record's own fields, e.g. reason code, price or amount
     */
    public record Event(String orderId, Instant occurredAt, String source, String type, String actor,
                        Map<String, Object> details) {
    }
}
