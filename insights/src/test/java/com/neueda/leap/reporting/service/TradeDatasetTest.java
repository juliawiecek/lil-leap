package com.neueda.leap.reporting.service;

import com.neueda.leap.reporting.service.TradeDataset.Trade;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Runs the dataset's real SQL against a database shaped like the reporting replica. */
class TradeDatasetTest {

    private final ReplicaDatabase replica = new ReplicaDatabase();
    private final UUID maya = UUID.randomUUID();
    private final UUID order = UUID.randomUUID();

    TradeDatasetTest() {
        replica.instrument("AAPL", "Apple Inc.", "COMMON_STOCK", "NASDAQ");
        replica.instrument("KO", "The Coca-Cola Company", "COMMON_STOCK", "NYSE");
        replica.account(maya, "Maya", "Chen", "maya.chen@demo.nexttrade.local", "NT-DEMO-0001", "Maya Chen Individual",
                "ACTIVE", "NOVICE");
    }

    @Test
    void readsEachFillWithItsInstrumentAccountAndClient() {
        replica.fill(order, maya, "AAPL", "BUY", 3, "225.10", "2026-10-16T14:13:00Z");

        Trade trade = replica.dataset().trades().get(0);

        assertThat(trade.orderId()).isEqualTo(order.toString());
        assertThat(trade.fillId()).isNotBlank();
        assertThat(trade.filledAt()).isEqualTo(Instant.parse("2026-10-16T14:13:00Z"));
        assertThat(trade.instrumentSymbol()).isEqualTo("AAPL");
        assertThat(trade.instrumentName()).isEqualTo("Apple Inc.");
        assertThat(trade.assetClass()).isEqualTo("COMMON_STOCK");
        assertThat(trade.marketCode()).isEqualTo("NASDAQ");
        assertThat(trade.userId()).isNotBlank();
        assertThat(trade.clientEmail()).isEqualTo("maya.chen@demo.nexttrade.local");
        assertThat(trade.clientName()).isEqualTo("Maya Chen");
        assertThat(trade.accountId()).isEqualTo(maya.toString());
        assertThat(trade.accountNumber()).isEqualTo("NT-DEMO-0001");
        assertThat(trade.accountName()).isEqualTo("Maya Chen Individual");
        assertThat(trade.accountStatus()).isEqualTo("ACTIVE");
        assertThat(trade.traderLevel()).isEqualTo("NOVICE");
        assertThat(trade.side()).isEqualTo("BUY");
        assertThat(trade.filledQuantity()).isEqualTo(3);
        assertThat(trade.executionPrice()).isEqualTo(new BigDecimal("225.10"));
        assertThat(trade.notional()).isEqualByComparingTo("675.30");
    }

    @Test
    void returnsEveryFillOldestFirst() {
        replica.fill(maya, "KO", "SELL", 1, "70", "2026-10-17T14:00:00Z");
        replica.fill(maya, "AAPL", "BUY", 2, "220", "2026-10-15T14:00:00Z");
        replica.fill(maya, "AAPL", "SELL", 1, "230", "2026-10-16T14:00:00Z");

        List<Trade> trades = replica.dataset().trades();

        assertThat(trades).extracting(Trade::filledAt).containsExactly(Instant.parse("2026-10-15T14:00:00Z"),
                Instant.parse("2026-10-16T14:00:00Z"), Instant.parse("2026-10-17T14:00:00Z"));
    }

    @Test
    void anEmptyReplicaHasNoFills() {
        assertThat(replica.dataset().trades()).isEmpty();
    }

    @Test
    void aTraderWithoutAProfileHasAnEmptyNameButKeepsTheirEmail() {
        UUID noProfile = UUID.randomUUID();
        replica.account(noProfile, null, null, "new.trader@demo.nexttrade.local", "NT-DEMO-0002", "New", "ACTIVE",
                "NOVICE");
        replica.fill(noProfile, "AAPL", "BUY", 1, "225", "2026-10-16T14:00:00Z");

        Trade trade = replica.dataset().trades().get(0);

        assertThat(trade.clientName()).isEmpty();
        assertThat(trade.clientEmail()).isEqualTo("new.trader@demo.nexttrade.local");
        assertThat(TradeDataset.clientName("Maya", null)).isEqualTo("Maya");
        assertThat(TradeDataset.clientName(null, "Chen")).isEqualTo("Chen");
    }

    @Test
    void pricesLoseTheColumnsPaddingButKeepCents() {
        assertThat(TradeDataset.price(new BigDecimal("225.10000000"))).isEqualTo(new BigDecimal("225.10"));
        assertThat(TradeDataset.price(new BigDecimal("49.52500000"))).isEqualTo(new BigDecimal("49.525"));
        assertThat(TradeDataset.price(new BigDecimal("300.00000000"))).isEqualTo(new BigDecimal("300.00"));
        assertThat(TradeDataset.price(new BigDecimal("0.00000000"))).isEqualTo(new BigDecimal("0.00"));
    }
}
