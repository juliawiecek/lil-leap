package com.neueda.leap.order.market;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;

/** Whether the market is open, for the dashboards' status badge and countdown. */
@RestController
@RequestMapping("/market")
public class MarketStatusController {
    private final MarketHours hours;
    private final Clock clock;

    /**
     * Creates the controller.
     *
     * @param hours exchange session rules
     * @param clock source of the current time
     */
    public MarketStatusController(MarketHours hours, Clock clock) {
        this.hours = hours;
        this.clock = clock;
    }

    /**
     * {@code GET /market/status}.
     *
     * @return open now or not, the exchange time zone, and the next open and close as UTC instants
     */
    @GetMapping("/status")
    public MarketStatus status() {
        return hours.status(clock.instant());
    }
}
