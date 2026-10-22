package com.neueda.leap.reporting.clients;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;
import java.util.Set;

/**
 * A validated Clients list request. Filters and sort keys are checked against fixed lists here.
 *
 * @param search text to match in the account number or name or the client's name or email, or a full order or
 *               account ID; null for all
 * @param level NOVICE or ADVANCED, or null for both
 * @param status PENDING, ACTIVE, BLOCKED or CLOSED, or null for all
 * @param sort sort key, one of {@link #SORTS}
 * @param descending sort direction
 * @param page zero-based page number
 * @param size page size
 */
public record ClientQuery(String search, String level, String status, String sort, boolean descending,
                          int page, int size) {

    /** Trader levels an account can have. */
    public static final Set<String> LEVELS = Set.of("NOVICE", "ADVANCED");
    /** Statuses an account can have. */
    public static final Set<String> STATUSES = Set.of("PENDING", "ACTIVE", "BLOCKED", "CLOSED");
    /** Sort keys the API accepts: fields of {@link ClientDtos.ClientSummary}. */
    static final Set<String> SORTS = Set.of("accountNumber", "accountName", "clientName", "email", "traderLevel",
            "status", "tradeCount", "tradedValue", "lastTradeAt");

    /**
     * Validates the request parameters.
     *
     * @param search free-text search, may be blank
     * @param level trader level filter, may be blank
     * @param status status filter, may be blank
     * @param sort {@code key} or {@code key,asc|desc}; defaults to account number ascending
     * @param page zero-based page number
     * @param size page size
     * @return the query
     * @throws ResponseStatusException 400 for an unknown level, status or sort
     */
    public static ClientQuery of(String search, String level, String status, String sort, int page, int size) {
        String[] parts = (sort == null || sort.isBlank() ? "accountNumber" : sort).split(",", -1);
        String key = parts[0].trim();
        String direction = parts.length > 1 ? parts[1].trim().toLowerCase(Locale.ROOT) : "asc";
        if (!SORTS.contains(key) || parts.length > 2 || !Set.of("asc", "desc").contains(direction)) {
            throw badRequest();
        }
        return new ClientQuery(blankToNull(search), allowed(level, LEVELS), allowed(status, STATUSES),
                key, direction.equals("desc"), page, size);
    }

    private static String allowed(String value, Set<String> values) {
        String normalized = blankToNull(value);
        if (normalized == null) {
            return null;
        }
        normalized = normalized.toUpperCase(Locale.ROOT);
        if (!values.contains(normalized)) {
            throw badRequest();
        }
        return normalized;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static ResponseStatusException badRequest() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST);
    }
}
