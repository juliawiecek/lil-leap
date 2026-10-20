package com.neueda.leap.trades;

import com.neueda.leap.reporting.service.TradeDataset;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ResourceLoader;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TradeLookupTest {

    private static final UUID ORDER = UUID.fromString("f0000000-0000-4000-8000-000000000012");
    private static final UUID ACCOUNT = UUID.fromString("e0000000-0000-4000-8000-000000000001");
    private static final String CSV = """
            fill_id,order_id,filled_at,instrument_id,instrument_symbol,instrument_name,asset_class,market_code,user_id,client_email,client_name,account_id,account_number,account_name,account_status,trader_level,side,filled_quantity,execution_price
            d451bd0a-40e6-d7c5-f00c-dc2a1f31a24f,f0000000-0000-4000-8000-000000000012,2026-10-05T18:04:36Z,34f28579-c9a3-4a56-dfd9-127b43ecf73f,BAC,"Bank of America, Corp.",COMMON_STOCK,NYSE,d0000000-0000-4000-8000-000000000001,maya.chen@demo.nexttrade.local,Maya Chen,e0000000-0000-4000-8000-000000000001,NT-DEMO-0001,Maya Chen Individual,ACTIVE,NOVICE,BUY,49,49.525
            """;

    private final TradeLookup lookup;

    TradeLookupTest() {
        ResourceLoader loader = mock(ResourceLoader.class);
        when(loader.getResource("classpath:reports/trades.csv"))
                .thenAnswer(ignored -> new ByteArrayResource(CSV.getBytes(StandardCharsets.UTF_8)));
        lookup = new TradeLookup(new TradeDataset(loader));
    }

    @Test
    void findsATradeWithItsValueAndClient() {
        assertThat(lookup.find(ORDER)).contains(new TradeRecord(ORDER, Instant.parse("2026-10-05T18:04:36Z"), "BAC",
                "Bank of America, Corp.", "BUY", 49, new BigDecimal("49.525"), new BigDecimal("2426.73"),
                new TradeRecord.Account(ACCOUNT, "NT-DEMO-0001", "Maya Chen Individual", "Maya Chen",
                        "maya.chen@demo.nexttrade.local", "NOVICE", "ACTIVE")));
    }

    @Test
    void anOrderMissingFromTheDatasetIsEmpty() {
        assertThat(lookup.find(UUID.randomUUID())).isEmpty();
    }
}
