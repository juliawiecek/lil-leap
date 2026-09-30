package com.neueda.leap.order.service;

import com.neueda.leap.order.dto.OrderSubmissionResponse;
import com.neueda.leap.order.dto.SubmitOrderRequest;
import com.neueda.leap.order.exception.OrderAccountNotFoundException;
import com.neueda.leap.order.exception.OrderRuleException;
import com.neueda.leap.order.exception.OrderSufficiencyException;
import com.neueda.leap.order.model.Account;
import com.neueda.leap.order.model.Instrument;
import com.neueda.leap.order.model.Order;
import com.neueda.leap.order.model.Quote;
import com.neueda.leap.order.repository.InstrumentRepository;
import com.neueda.leap.order.repository.JdbcOrderSufficiencyRepository;
import com.neueda.leap.order.repository.OrderAccountRepository;
import com.neueda.leap.order.repository.OrderRepository;
import com.neueda.leap.order.repository.OrderStatusHistoryRepository;
import com.neueda.leap.order.repository.QuoteRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for OrderSubmissionService (NEXT-191/192/193).
 * Tests comprehensive validation pipeline: account eligibility, instrument support,
 * and cash/holdings sufficiency.
 */
@SpringBootTest
@ActiveProfiles("test")
class OrderSubmissionServiceTest {

    @Autowired
    private OrderSubmissionService orderSubmissionService;

    @Autowired
    private OrderAccountRepository accountRepository;

    @Autowired
    private InstrumentRepository instrumentRepository;

    @Autowired
    private QuoteRepository quoteRepository;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID userId;
    private UUID accountId;
    private UUID instrumentId;

    @BeforeEach
    void setUp() {
        // Clear all tables
        jdbc.update("DELETE FROM order_status_history");
        jdbc.update("DELETE FROM orders");
        jdbc.update("DELETE FROM quotes");
        jdbc.update("DELETE FROM holdings");
        jdbc.update("DELETE FROM cash_balances");
        jdbc.update("DELETE FROM accounts");
        jdbc.update("DELETE FROM instruments");

        userId = UUID.fromString("550e8400-e29b-41d4-a716-446655440000");
        accountId = UUID.fromString("650e8400-e29b-41d4-a716-446655440001");
        instrumentId = UUID.fromString("550e8400-e29b-41d4-a716-446655440010");

        // Create active account with trading enabled
        Account account = new Account(accountId, userId, "ACC001", "Test Account", "INDIVIDUAL",
                "ACTIVE", "STANDARD", BigDecimal.valueOf(1000), BigDecimal.valueOf(5.00));
        account.setTradingEnabled(true);
        account.setMarginApproved(false);
        account.setOptionsApproved(false);
        accountRepository.save(account);

        // Create active instrument
        Instrument instrument = new Instrument(instrumentId, "AAPL", "Apple Inc.", "COMMON_STOCK",
                "USD", "NASDAQ", true);
        instrumentRepository.save(instrument);

        // Set up cash balance
        jdbc.update("INSERT INTO cash_balances (account_id, currency, balance) VALUES (?, 'USD', ?)",
                accountId, BigDecimal.valueOf(10000));

        // Set up holdings
        jdbc.update("INSERT INTO holdings (account_id, instrument_id, quantity) VALUES (?, ?, ?)",
                accountId, instrumentId, 100L);

        // Set up quote
        Quote quote = new Quote(UUID.randomUUID(), instrument, BigDecimal.valueOf(150.00),
                BigDecimal.valueOf(150.10), Instant.now(), "MARKET_DATA", false);
        quoteRepository.save(quote);
    }

    // NEXT-191 Tests: Account Eligibility

    @Test
    void testValidBuyOrderAccepted() {
        // Arrange
        SubmitOrderRequest request = new SubmitOrderRequest(
                accountId, instrumentId, "BUY", 10L, UUID.randomUUID()
        );

        // Act
        OrderSubmissionResponse response = orderSubmissionService.submit(userId, request);

        // Assert
        assertNotNull(response);
        assertNotNull(response.orderId());
        assertEquals("PENDING", response.status());

        Order savedOrder = orderRepository.findById(response.orderId()).orElseThrow();
        assertEquals("BUY", savedOrder.getSide());
        assertEquals(10L, savedOrder.getQuantity());
    }

    @Test
    void testValidSellOrderAccepted() {
        // Arrange
        SubmitOrderRequest request = new SubmitOrderRequest(
                accountId, instrumentId, "SELL", 50L, UUID.randomUUID()
        );

        // Act
        OrderSubmissionResponse response = orderSubmissionService.submit(userId, request);

        // Assert
        assertNotNull(response);
        assertEquals("PENDING", response.status());

        Order savedOrder = orderRepository.findById(response.orderId()).orElseThrow();
        assertEquals("SELL", savedOrder.getSide());
        assertEquals(50L, savedOrder.getQuantity());
    }

    @Test
    void testForeignAccountDenied() {
        // Arrange
        UUID otherUserId = UUID.randomUUID();
        SubmitOrderRequest request = new SubmitOrderRequest(
                accountId, instrumentId, "BUY", 10L, UUID.randomUUID()
        );

        // Act & Assert
        assertThrows(OrderAccountNotFoundException.class,
                () -> orderSubmissionService.submit(otherUserId, request));

        long orderCount = jdbc.queryForObject("SELECT COUNT(*) FROM orders", Long.class);
        assertEquals(0L, orderCount);
    }

    @Test
    void testInactiveAccountRejected() {
        // Arrange
        UUID inactiveAccountId = UUID.fromString("750e8400-e29b-41d4-a716-446655440002");
        Account inactiveAccount = new Account(inactiveAccountId, userId, "ACC002", "Inactive", "INDIVIDUAL",
                "INACTIVE", "STANDARD", BigDecimal.valueOf(1000), BigDecimal.valueOf(5.00));
        inactiveAccount.setTradingEnabled(true);
        inactiveAccount.setMarginApproved(false);
        inactiveAccount.setOptionsApproved(false);
        accountRepository.save(inactiveAccount);

        SubmitOrderRequest request = new SubmitOrderRequest(
                inactiveAccountId, instrumentId, "BUY", 10L, UUID.randomUUID()
        );

        // Act & Assert
        OrderRuleException ex = assertThrows(OrderRuleException.class,
                () -> orderSubmissionService.submit(userId, request));
        assertEquals(OrderRuleException.Reason.ACCOUNT_NOT_ACTIVE, ex.reason());

        long orderCount = jdbc.queryForObject("SELECT COUNT(*) FROM orders", Long.class);
        assertEquals(0L, orderCount);
    }

    @Test
    void testTradingDisabledAccountRejected() {
        // Arrange
        UUID disabledTradingAccountId = UUID.fromString("850e8400-e29b-41d4-a716-446655440003");
        Account disabledAccount = new Account(disabledTradingAccountId, userId, "ACC003", "Disabled", "INDIVIDUAL",
                "ACTIVE", "STANDARD", BigDecimal.valueOf(1000), BigDecimal.valueOf(5.00));
        disabledAccount.setTradingEnabled(false);
        disabledAccount.setMarginApproved(false);
        disabledAccount.setOptionsApproved(false);
        accountRepository.save(disabledAccount);

        SubmitOrderRequest request = new SubmitOrderRequest(
                disabledTradingAccountId, instrumentId, "BUY", 10L, UUID.randomUUID()
        );

        // Act & Assert
        OrderRuleException ex = assertThrows(OrderRuleException.class,
                () -> orderSubmissionService.submit(userId, request));
        assertEquals(OrderRuleException.Reason.TRADING_NOT_ENABLED, ex.reason());

        long orderCount = jdbc.queryForObject("SELECT COUNT(*) FROM orders", Long.class);
        assertEquals(0L, orderCount);
    }

    // NEXT-193 Tests: Instrument Support and Tradability

    @Test
    void testUnsupportedInstrumentRejected() {
        // Arrange
        UUID unknownInstrumentId = UUID.randomUUID();
        SubmitOrderRequest request = new SubmitOrderRequest(
                accountId, unknownInstrumentId, "BUY", 10L, UUID.randomUUID()
        );

        // Act & Assert
        OrderRuleException ex = assertThrows(OrderRuleException.class,
                () -> orderSubmissionService.submit(userId, request));
        assertEquals(OrderRuleException.Reason.INSTRUMENT_UNSUPPORTED, ex.reason());

        long orderCount = jdbc.queryForObject("SELECT COUNT(*) FROM orders", Long.class);
        assertEquals(0L, orderCount);
    }

    @Test
    void testDisabledInstrumentRejected() {
        // Arrange
        UUID disabledInstrumentId = UUID.fromString("650e8400-e29b-41d4-a716-446655440011");
        Instrument disabledInstrument = new Instrument(disabledInstrumentId, "HALT", "Halted", "COMMON_STOCK",
                "USD", "NYSE", false);
        instrumentRepository.save(disabledInstrument);

        SubmitOrderRequest request = new SubmitOrderRequest(
                accountId, disabledInstrumentId, "BUY", 10L, UUID.randomUUID()
        );

        // Act & Assert
        OrderRuleException ex = assertThrows(OrderRuleException.class,
                () -> orderSubmissionService.submit(userId, request));
        assertEquals(OrderRuleException.Reason.INSTRUMENT_DISABLED, ex.reason());

        long orderCount = jdbc.queryForObject("SELECT COUNT(*) FROM orders", Long.class);
        assertEquals(0L, orderCount);
    }

    // NEXT-192 Tests: Sufficiency Checks

    @Test
    void testBuyWithInsufficientCashRejected() {
        // Arrange: Reduce cash to less than required
        // 10 shares × $150.10 ask × 1.05 (5% buffer) = $1,576.05
        jdbc.update("UPDATE cash_balances SET balance = ? WHERE account_id = ?",
                BigDecimal.valueOf(1000), accountId);

        SubmitOrderRequest request = new SubmitOrderRequest(
                accountId, instrumentId, "BUY", 10L, UUID.randomUUID()
        );

        // Act & Assert
        OrderSufficiencyException ex = assertThrows(OrderSufficiencyException.class,
                () -> orderSubmissionService.submit(userId, request));
        assertEquals(OrderSufficiencyException.Reason.INSUFFICIENT_CASH, ex.reason());

        long orderCount = jdbc.queryForObject("SELECT COUNT(*) FROM orders", Long.class);
        assertEquals(0L, orderCount);
    }

    @Test
    void testSellWithInsufficientHoldingsRejected() {
        // Arrange: Try to sell more than account holds
        SubmitOrderRequest request = new SubmitOrderRequest(
                accountId, instrumentId, "SELL", 200L, UUID.randomUUID()
        );

        // Act & Assert
        OrderSufficiencyException ex = assertThrows(OrderSufficiencyException.class,
                () -> orderSubmissionService.submit(userId, request));
        assertEquals(OrderSufficiencyException.Reason.INSUFFICIENT_HOLDINGS, ex.reason());

        long orderCount = jdbc.queryForObject("SELECT COUNT(*) FROM orders", Long.class);
        assertEquals(0L, orderCount);
    }

    @Test
    void testBuyUsesLatestAskPrice() {
        // Arrange: Create newer quote with higher ask price
        Instrument instrument = instrumentRepository.findById(instrumentId).orElseThrow();
        Quote newQuote = new Quote(UUID.randomUUID(), instrument, BigDecimal.valueOf(160.00),
                BigDecimal.valueOf(160.10), Instant.now(), "MARKET_DATA", false);
        quoteRepository.save(newQuote);

        // Reduce cash to barely afford with new price
        // 10 shares × $160.10 ask × 1.05 buffer = $1,680.50
        jdbc.update("UPDATE cash_balances SET balance = ? WHERE account_id = ?",
                BigDecimal.valueOf(1700), accountId);

        SubmitOrderRequest request = new SubmitOrderRequest(
                accountId, instrumentId, "BUY", 10L, UUID.randomUUID()
        );

        // Act
        OrderSubmissionResponse response = orderSubmissionService.submit(userId, request);

        // Assert
        assertNotNull(response);
        assertEquals("PENDING", response.status());
    }

    @Test
    void testNoQuoteRejectedClearly() {
        // Arrange: Create instrument without quote
        UUID noQuoteInstrumentId = UUID.randomUUID();
        Instrument noQuoteInstrument = new Instrument(noQuoteInstrumentId, "NOQUOTE", "No Quote", "COMMON_STOCK",
                "USD", "NYSE", true);
        instrumentRepository.save(noQuoteInstrument);

        SubmitOrderRequest request = new SubmitOrderRequest(
                accountId, noQuoteInstrumentId, "BUY", 10L, UUID.randomUUID()
        );

        // Act & Assert
        OrderSufficiencyException ex = assertThrows(OrderSufficiencyException.class,
                () -> orderSubmissionService.submit(userId, request));
        assertEquals(OrderSufficiencyException.Reason.QUOTE_UNAVAILABLE, ex.reason());

        long orderCount = jdbc.queryForObject("SELECT COUNT(*) FROM orders", Long.class);
        assertEquals(0L, orderCount);
    }
}

