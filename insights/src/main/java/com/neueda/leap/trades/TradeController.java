package com.neueda.leap.trades;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/** Trade investigation API for trading operations staff (BR-15, TS-03.5). */
@RestController
@RequestMapping("/trades")
@PreAuthorize("hasRole('OPERATIONS')")
public class TradeController {
    private final TradeTrailRepository trails;

    /**
     * Creates the trade investigation endpoints.
     *
     * @param trails the shared trade trail
     */
    public TradeController(TradeTrailRepository trails) {
        this.trails = trails;
    }

    /**
     * Returns the raw, chronological event list behind a trade's lifecycle (TS-16.1b).
     *
     * @param id the trade's order id
     * @return every recorded step, oldest first, and whether any audit rows exist yet
     * @throws ResponseStatusException 404 when no such trade exists
     */
    @GetMapping("/{id}/events")
    public TradeEventsResponse events(@PathVariable UUID id) {
        List<TradeEvent> events = trails.trail(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No trade found with id " + id));
        boolean audited = events.stream().anyMatch(event -> "AUDIT".equals(event.source()));
        return new TradeEventsResponse(id, audited, events);
    }
}
