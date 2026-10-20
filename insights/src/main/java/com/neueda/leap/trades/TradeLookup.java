package com.neueda.leap.trades;

import com.neueda.leap.reporting.service.TradeDataset;
import com.neueda.leap.reporting.service.TradeDataset.Trade;
import com.neueda.leap.reporting.service.TradeEventDataset;
import org.springframework.stereotype.Repository;

import java.math.RoundingMode;
import java.util.Optional;
import java.util.UUID;

/**
 * Finds a trade and its recorded steps in the reporting dataset ({@code reports/trades.csv} and
 * {@code reports/trade-events.csv}), the files the Clients and Reports pages read.
 */
@Repository
public class TradeLookup {

    private final TradeDataset dataset;
    private final TradeEventDataset events;

    /**
     * Creates the lookup.
     *
     * @param dataset the fills
     * @param events the fills' recorded steps
     */
    public TradeLookup(TradeDataset dataset, TradeEventDataset events) {
        this.dataset = dataset;
        this.events = events;
    }

    /**
     * Finds a trade by its order id.
     *
     * @param orderId the trade's order id
     * @return the trade with its steps, or empty when the dataset has no fill for that order
     */
    public Optional<TradeRecord> find(UUID orderId) {
        String id = orderId.toString();
        return dataset.trades().stream()
                .filter(trade -> trade.orderId().equalsIgnoreCase(id))
                .findFirst()
                .map(this::record);
    }

    private TradeRecord record(Trade trade) {
        return new TradeRecord(UUID.fromString(trade.orderId()), trade.filledAt(), trade.instrumentSymbol(),
                trade.instrumentName(), trade.side(), trade.filledQuantity(), trade.executionPrice(),
                trade.notional().setScale(2, RoundingMode.HALF_UP),
                new TradeRecord.Account(UUID.fromString(trade.accountId()), trade.accountNumber(), trade.accountName(),
                        trade.clientName(), trade.clientEmail(), trade.traderLevel(), trade.accountStatus()),
                events.events(trade.orderId()).stream()
                        .map(step -> new TradeRecord.Event(step.source(), step.type(), step.actor(), step.occurredAt(),
                                step.details()))
                        .toList());
    }
}
