package com.neueda.leap.trades;

import com.neueda.leap.reporting.service.TradeDataset;
import com.neueda.leap.reporting.service.TradeDataset.Trade;
import org.springframework.stereotype.Repository;

import java.math.RoundingMode;
import java.util.Optional;
import java.util.UUID;

/** Finds a trade in the reporting dataset ({@code reports/trades.csv}), the file the Clients and Reports pages read. */
@Repository
public class TradeLookup {

    private final TradeDataset dataset;

    /**
     * Creates the lookup.
     *
     * @param dataset the reporting dataset
     */
    public TradeLookup(TradeDataset dataset) {
        this.dataset = dataset;
    }

    /**
     * Finds a trade by its order id.
     *
     * @param orderId the trade's order id
     * @return the trade, or empty when the dataset has no fill for that order
     */
    public Optional<TradeRecord> find(UUID orderId) {
        String id = orderId.toString();
        return dataset.trades().stream()
                .filter(trade -> trade.orderId().equalsIgnoreCase(id))
                .findFirst()
                .map(TradeLookup::record);
    }

    private static TradeRecord record(Trade trade) {
        return new TradeRecord(UUID.fromString(trade.orderId()), trade.filledAt(), trade.instrumentSymbol(),
                trade.instrumentName(), trade.side(), trade.filledQuantity(), trade.executionPrice(),
                trade.notional().setScale(2, RoundingMode.HALF_UP),
                new TradeRecord.Account(UUID.fromString(trade.accountId()), trade.accountNumber(), trade.accountName(),
                        trade.clientName(), trade.clientEmail(), trade.traderLevel(), trade.accountStatus()));
    }
}
