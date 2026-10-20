package com.neueda.leap.reporting.clients;

import com.neueda.leap.reporting.service.TradeDataset;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ResourceLoader;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ClientRepositoryTest {

    private static final String HEADER = "fill_id,order_id,filled_at,instrument_id,instrument_symbol,instrument_name,"
            + "asset_class,market_code,user_id,client_email,client_name,account_id,account_number,account_name,"
            + "account_status,trader_level,side,filled_quantity,execution_price";

    private final UUID maya = UUID.randomUUID();
    private final UUID jordan = UUID.randomUUID();
    private final UUID blocked = UUID.randomUUID();
    private final UUID mayaFirstOrder = UUID.randomUUID();
    private final UUID mayaSell = UUID.randomUUID();
    private final List<String> rows = new ArrayList<>();
    private final ClientRepository clients;

    ClientRepositoryTest() {
        fill(maya, mayaFirstOrder, "AAPL", "BUY", 2, "225.10", "2026-10-15T14:00:00Z");
        fill(maya, UUID.randomUUID(), "MSFT", "BUY", 1, "500.00", "2026-10-16T14:00:00Z");
        fill(maya, UUID.randomUUID(), "AAPL", "BUY", 2, "230.10", "2026-10-17T14:00:00Z");
        fill(maya, mayaSell, "AAPL", "SELL", 1, "240.00", "2026-10-18T14:00:00Z");
        fill(maya, UUID.randomUUID(), "MSFT", "SELL", 1, "510.00", "2026-10-18T15:00:00Z");
        fill(jordan, UUID.randomUUID(), "AAPL", "BUY", 5, "226.00", "2026-10-14T14:00:00Z");
        fill(blocked, UUID.randomUUID(), "TSLA", "BUY", 1, "250.00", "2026-10-10T14:00:00Z");
        ResourceLoader loader = mock(ResourceLoader.class);
        when(loader.getResource("classpath:reports/trades.csv")).thenAnswer(ignored ->
                new ByteArrayResource((HEADER + "\n" + String.join("\n", rows) + "\n").getBytes(StandardCharsets.UTF_8)));
        clients = new ClientRepository(new TradeDataset(loader));
    }

    private void fill(UUID account, UUID order, String symbol, String side, long quantity, String price, String at) {
        String[] owner = account.equals(maya)
                ? new String[]{"maya.chen@example.test", "Maya Chen", "NT-DEMO-0001", "Novice 100% cash_account", "ACTIVE", "NOVICE"}
                : account.equals(jordan)
                ? new String[]{"jordan.lee@example.test", "Jordan Lee", "NT-DEMO-0002", "Advanced account", "ACTIVE", "ADVANCED"}
                : new String[]{"noah.bennett@example.test", "Noah Bennett", "NT-DEMO-0003", "Blocked account", "BLOCKED", "NOVICE"};
        rows.add(String.join(",", UUID.randomUUID().toString(), order.toString(), at, UUID.randomUUID().toString(), symbol,
                "\"" + symbol + ", Inc.\"", "COMMON_STOCK", "NASDAQ", UUID.randomUUID().toString(), owner[0], owner[1],
                account.toString(), owner[2], owner[3], owner[4], owner[5], side, Long.toString(quantity), price));
    }

    private ClientQuery query(String search, String level, String status, String sort) {
        return ClientQuery.of(search, level, status, sort, 0, 25);
    }

    private List<UUID> ids(ClientQuery query) {
        return clients.list(query).content().stream().map(ClientDtos.ClientSummary::accountId).toList();
    }

    @Test
    void listsEveryAccountWithItsOwnerTradesValueAndLastTrade() {
        ClientDtos.Page<ClientDtos.ClientSummary> page = clients.list(query(null, null, null, null));

        assertThat(page.totalElements()).isEqualTo(3);
        assertThat(page.totalPages()).isEqualTo(1);
        assertThat(page.content()).extracting(ClientDtos.ClientSummary::accountNumber)
                .containsExactly("NT-DEMO-0001", "NT-DEMO-0002", "NT-DEMO-0003");
        assertThat(page.content().get(0)).isEqualTo(new ClientDtos.ClientSummary(maya, "NT-DEMO-0001",
                "Novice 100% cash_account", "Maya Chen", "maya.chen@example.test", "NOVICE", "ACTIVE", 5,
                new BigDecimal("2160.40"), Instant.parse("2026-10-18T15:00:00Z")));
        assertThat(page.content().get(2).status()).isEqualTo("BLOCKED");
    }

    @Test
    void searchMatchesAccountNumberAndNameOrTheClientsNameAndEmailAsText() {
        assertThat(ids(query("demo-0002", null, null, null))).containsExactly(jordan);
        assertThat(ids(query("maya ch", null, null, null))).containsExactly(maya);
        assertThat(ids(query("JORDAN.LEE@", null, null, null))).containsExactly(jordan);
        assertThat(ids(query("BLOCKED", null, null, null))).containsExactly(blocked);
        assertThat(ids(query("100%", null, null, null))).containsExactly(maya);
        assertThat(ids(query("_", null, null, null))).containsExactly(maya);
    }

    @Test
    void aPastedOrderOrAccountIdFindsItsAccount() {
        assertThat(ids(query(mayaSell.toString(), null, null, null))).containsExactly(maya);
        assertThat(ids(query(jordan.toString(), null, null, null))).containsExactly(jordan);
        assertThat(ids(query(UUID.randomUUID().toString(), null, null, null))).isEmpty();
    }

    @Test
    void filtersSortAndPage() {
        assertThat(ids(query(null, "NOVICE", null, null))).containsExactly(maya, blocked);
        assertThat(ids(query(null, "NOVICE", "ACTIVE", null))).containsExactly(maya);
        assertThat(ids(query(null, null, null, "tradedValue,desc"))).containsExactly(maya, jordan, blocked);
        assertThat(ids(query(null, null, null, "lastTradeAt,desc"))).containsExactly(maya, jordan, blocked);
        assertThat(ids(query(null, null, null, "clientName"))).containsExactly(jordan, maya, blocked);
        assertThat(ids(query(null, null, null, "email,desc"))).containsExactly(blocked, maya, jordan);

        ClientDtos.Page<ClientDtos.ClientSummary> second = clients.list(ClientQuery.of(null, null, null, "tradeCount,desc", 1, 2));
        assertThat(second.totalElements()).isEqualTo(3);
        assertThat(second.totalPages()).isEqualTo(2);
        assertThat(second.content()).extracting(ClientDtos.ClientSummary::accountId)
                .as("equal trade counts fall back to account number").containsExactly(blocked);
        assertThat(clients.list(ClientQuery.of(null, null, null, null, 5, 25)).content()).isEmpty();
    }

    @Test
    void holdingsReplayBuysAndSellsAtAverageCost() {
        assertThat(clients.summary(maya)).get().extracting(ClientDtos.ClientSummary::accountName)
                .isEqualTo("Novice 100% cash_account");
        assertThat(clients.summary(UUID.randomUUID())).isEmpty();
        assertThat(clients.holdings(maya)).as("MSFT was sold out; one AAPL sold at the average cost").containsExactly(
                new ClientDtos.Holding("AAPL", "AAPL, Inc.", 3, new BigDecimal("227.6000"), new BigDecimal("682.80")));
        assertThat(clients.holdings(blocked)).containsExactly(
                new ClientDtos.Holding("TSLA", "TSLA, Inc.", 1, new BigDecimal("250.0000"), new BigDecimal("250.00")));
    }

    @Test
    void ordersAreNewestFirstAndCanBeSearchedAndPaged() {
        ClientDtos.Page<ClientDtos.Order> orders = clients.orders(maya, null, 0, 25);

        assertThat(orders.totalElements()).isEqualTo(5);
        assertThat(orders.content().get(1).orderId()).isEqualTo(mayaSell);
        ClientDtos.Order oldest = orders.content().get(4);
        assertThat(oldest).isEqualTo(new ClientDtos.Order(mayaFirstOrder, Instant.parse("2026-10-15T14:00:00Z"), "AAPL",
                "BUY", 2, new BigDecimal("225.10")));

        assertThat(clients.orders(maya, "aa", 0, 25).totalElements()).isEqualTo(3);
        assertThat(clients.orders(maya, mayaFirstOrder.toString(), 0, 25).content())
                .extracting(ClientDtos.Order::orderId).containsExactly(mayaFirstOrder);
        assertThat(clients.orders(jordan, mayaFirstOrder.toString(), 0, 25).content())
                .as("an order ID only matches the account's own orders").isEmpty();
        ClientDtos.Page<ClientDtos.Order> paged = clients.orders(maya, null, 2, 2);
        assertThat(paged.content()).extracting(ClientDtos.Order::orderId).containsExactly(mayaFirstOrder);
        assertThat(paged.totalPages()).isEqualTo(3);
    }
}
