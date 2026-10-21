package com.neueda.leap.trades;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/** Trade lookup for trading operations staff (BR-15, TS-03.5), from the reporting dataset. */
@RestController
@RequestMapping("/trades")
@PreAuthorize("hasRole('OPERATIONS')")
public class TradeController {
    private final TradeLookup trades;

    /**
     * Creates the trade lookup endpoint.
     *
     * @param trades trades in the reporting dataset
     */
    public TradeController(TradeLookup trades) {
        this.trades = trades;
    }

    /**
     * Returns one trade: its fill and the account and client behind it.
     *
     * @param id the trade's order id
     * @return the trade
     * @throws ResponseStatusException 404 when the dataset has no such trade
     */
    @GetMapping("/{id}")
    public TradeRecord trade(@PathVariable UUID id) {
        return trades.find(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No trade found with id " + id));
    }
}
