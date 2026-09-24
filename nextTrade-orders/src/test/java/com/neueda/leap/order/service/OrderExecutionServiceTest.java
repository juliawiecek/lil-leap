package com.neueda.leap.order.service;

import com.neueda.leap.order.model.*;
import com.neueda.leap.order.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests for OrderExecutionService.
 * Tests all acceptance criteria and execution scenarios.
 */
@ExtendWith(MockitoExtension.class)
class OrderExecutionServiceTest {
    
    @Mock
    private OrderRepository orderRepository;
    
    @Mock
    private QuoteRepository quoteRepository;
    
    @Mock
    private FillRepository fillRepository;
    
    @Mock
    private OrderStatusHistoryRepository statusHistoryRepository;
    
    @Mock
    private HoldingMovementRepository holdingMovementRepository;
    
    @Mock
    private CashTransactionRepository cashTransactionRepository;
    
    private OrderExecutionService orderExecutionService;
    
    private Account testAccount;
    private Instrument testInstrument;
    private Order testOrder;
    private Quote testQuote;

    @BeforeEach
    void setUp() {
        orderExecutionService = new OrderExecutionService(
            orderRepository,
            quoteRepository,
            fillRepository,
            statusHistoryRepository,
            holdingMovementRepository,
            cashTransactionRepository
        );
        
        // Setup test data
        testAccount = new Account(
            UUID.randomUUID(),
            UUID.randomUUID(),
            "ACC-001",
            "Test Account",
            "INDIVIDUAL_CASH",
            "ACTIVE",
            "NOVICE",
            new BigDecimal("5000.00"),
            new BigDecimal("2.00")
        );
        
        testInstrument = new Instrument(
            UUID.randomUUID(),
            "AAPL",
            "Apple Inc",
            "COMMON_STOCK",
            "USD",
            "NASDAQ",
            true
        );
        
        testOrder = new Order(
            UUID.randomUUID(),
            testAccount,
            testInstrument,
            UUID.randomUUID(),
            "BUY",
            100L,
            "MARKET",
            "ACCEPTED"
        );
        testOrder.setAcceptedAt(Instant.now());
        testOrder.setNextExecutionAt(Instant.now().minusSeconds(1));
        
        testQuote = new Quote(
            UUID.randomUUID(),
            testInstrument,
            new BigDecimal("150.00"),
            new BigDecimal("150.50"),
            Instant.now(),
            "SYNTHETIC_GBM",
            true
        );
    }
    
    /**
     * AC1: Orders complete with a clear outcome.
     * Test: Successful fill should transition order to FILLED status.
     */
    @Test
    void testExecuteOrder_SuccessfulFill_OrderMarkedFilled() {
        // Arrange
        when(quoteRepository.findLatestByInstrumentId(testInstrument.getInstrumentId()))
            .thenReturn(Optional.of(testQuote));
        when(orderRepository.save(any(Order.class))).thenReturn(testOrder);
        
        // Act
        orderExecutionService.executeOrder(testOrder);
        
        // Assert - Order should be saved with FILLED status
        verify(orderRepository).save(argThat(order -> "FILLED".equals(order.getStatus())));
        verify(statusHistoryRepository).save(any(OrderStatusHistory.class));
    }
    
    /**
     * AC2: Filled orders record execution details.
     * Test: Fill entity should be persisted with correct details.
     */
    @Test
    void testExecuteOrder_SuccessfulFill_RecordsExecutionDetails() {
        // Arrange
        when(quoteRepository.findLatestByInstrumentId(testInstrument.getInstrumentId()))
            .thenReturn(Optional.of(testQuote));
        when(orderRepository.save(any(Order.class))).thenReturn(testOrder);
        
        // Act
        orderExecutionService.executeOrder(testOrder);
        
        // Assert - Fill should be saved with correct details
        verify(fillRepository).save(argThat(fill -> 
            fill.getOrder().getOrderId().equals(testOrder.getOrderId()) &&
            fill.getFilledQuantity().equals(testOrder.getQuantity()) &&
            fill.getExecutionPrice().equals(testQuote.getAsk())
        ));
    }
    
    /**
     * AC3: Rejected orders record rejection reasons.
     * Test: Order rejected due to price out of tolerance should record reason.
     */
    @Test
    void testExecuteOrder_PriceOutOfTolerance_RecordsRejectionReason() {
        // Arrange - Set price tolerance very strict to force rejection after attempts
        testAccount.setExecutionBufferPercent(new BigDecimal("0.01"));  // 0.01% tolerance
        
        // Quote with price far outside tolerance
        Quote expensiveQuote = new Quote(
            UUID.randomUUID(),
            testInstrument,
            new BigDecimal("200.00"),  // Way outside tolerance
            new BigDecimal("210.00"),
            Instant.now(),
            "SYNTHETIC_GBM",
            true
        );
        
        when(quoteRepository.findLatestByInstrumentId(testInstrument.getInstrumentId()))
            .thenReturn(Optional.of(expensiveQuote));
        when(orderRepository.save(any(Order.class))).thenReturn(testOrder);
        
        // Act - Execute order 10 times to trigger rejection
        for (int i = 0; i < 10; i++) {
            orderExecutionService.executeOrder(testOrder);
            testOrder.setExecutionAttempts((long) i + 1);
        }
        
        // Assert - Order should be rejected and reason recorded
        verify(statusHistoryRepository, atLeastOnce()).save(argThat(history ->
            "REJECTED".equals(history.getStatus()) &&
            "PRICE_OUT_OF_TOLERANCE".equals(history.getReasonCode())
        ));
    }
    
    /**
     * Test: Stale quote should trigger retry without rejection.
     */
    @Test
    void testExecuteOrder_StaleQuote_SchedulesRetry() {
        // Arrange - Create quote older than 60 seconds
        Quote staleQuote = new Quote(
            UUID.randomUUID(),
            testInstrument,
            new BigDecimal("150.00"),
            new BigDecimal("150.50"),
            Instant.now().minusSeconds(61),
            "SYNTHETIC_GBM",
            true
        );
        
        when(quoteRepository.findLatestByInstrumentId(testInstrument.getInstrumentId()))
            .thenReturn(Optional.of(staleQuote));
        when(orderRepository.save(any(Order.class))).thenReturn(testOrder);
        
        // Act
        orderExecutionService.executeOrder(testOrder);
        
        // Assert - Order should not be filled/rejected, but scheduled for retry
        verify(fillRepository, never()).save(any());
        verify(orderRepository).save(argThat(order ->
            !"FILLED".equals(order.getStatus()) &&
            !"REJECTED".equals(order.getStatus()) &&
            order.getLastExecutionError().equals("STALE_QUOTE")
        ));
    }
    
    /**
     * Test: No quote available should trigger retry.
     */
    @Test
    void testExecuteOrder_NoQuoteAvailable_SchedulesRetry() {
        // Arrange
        when(quoteRepository.findLatestByInstrumentId(testInstrument.getInstrumentId()))
            .thenReturn(Optional.empty());
        when(orderRepository.save(any(Order.class))).thenReturn(testOrder);
        
        // Act
        orderExecutionService.executeOrder(testOrder);
        
        // Assert - Order should not be filled, but scheduled for retry
        verify(fillRepository, never()).save(any());
        verify(orderRepository).save(argThat(order ->
            !"FILLED".equals(order.getStatus()) &&
            order.getLastExecutionError().equals("NO_QUOTE")
        ));
    }
    
    /**
     * Test: BUY order uses ASK price for execution.
     */
    @Test
    void testGetExecutionPrice_BuyOrder_UsesAskPrice() {
        // Act
        BigDecimal price = orderExecutionService.getExecutionPrice(testOrder, testQuote);
        
        // Assert
        assertEquals(testQuote.getAsk(), price);
    }
    
    /**
     * Test: SELL order uses BID price for execution.
     */
    @Test
    void testGetExecutionPrice_SellOrder_UsesBidPrice() {
        // Arrange
        testOrder.setSide("SELL");
        
        // Act
        BigDecimal price = orderExecutionService.getExecutionPrice(testOrder, testQuote);
        
        // Assert
        assertEquals(testQuote.getBid(), price);
    }
    
    /**
     * Test: Price within tolerance is accepted.
     */
    @Test
    void testIsPriceWithinTolerance_PriceWithinTolerance_ReturnsTrue() {
        // Arrange - Quote midpoint is 150.25, tolerance is 2%, so max acceptable is 150.25 * 1.02 = 153.255
        testAccount.setExecutionBufferPercent(new BigDecimal("2.00"));
        BigDecimal executionPrice = new BigDecimal("152.00");
        
        // Act
        boolean result = orderExecutionService.isPriceWithinTolerance(testOrder, testQuote, executionPrice);
        
        // Assert
        assertTrue(result);
    }
    
    /**
     * Test: Price outside tolerance is rejected.
     */
    @Test
    void testIsPriceWithinTolerance_PriceOutsideTolerance_ReturnsFalse() {
        // Arrange - Quote midpoint is 150.25, tolerance is 2%, so max acceptable is 153.255
        testAccount.setExecutionBufferPercent(new BigDecimal("2.00"));
        BigDecimal executionPrice = new BigDecimal("155.00");
        
        // Act
        boolean result = orderExecutionService.isPriceWithinTolerance(testOrder, testQuote, executionPrice);
        
        // Assert
        assertFalse(result);
    }
    
    /**
     * Test: Quote staleness is correctly detected.
     */
    @Test
    void testIsQuoteStale_QuoteOlderThan60Seconds_ReturnsTrue() {
        // Arrange
        Quote staleQuote = new Quote(
            UUID.randomUUID(),
            testInstrument,
            new BigDecimal("150.00"),
            new BigDecimal("150.50"),
            Instant.now().minusSeconds(61),
            "SYNTHETIC_GBM",
            true
        );
        
        // Act
        boolean result = orderExecutionService.isQuoteStale(staleQuote);
        
        // Assert
        assertTrue(result);
    }
    
    /**
     * Test: Fresh quote is not stale.
     */
    @Test
    void testIsQuoteStale_RecentQuote_ReturnsFalse() {
        // Act
        boolean result = orderExecutionService.isQuoteStale(testQuote);
        
        // Assert
        assertFalse(result);
    }
    
    /**
     * Test: HoldingMovement is created for BUY order with positive quantity.
     */
    @Test
    void testCreateHoldingMovement_BuyOrder_PositiveQuantityChange() {
        // Arrange
        Fill fill = new Fill(UUID.randomUUID(), testOrder, 100L, new BigDecimal("150.50"), Instant.now());
        
        // Act
        orderExecutionService.createHoldingMovement(testOrder, fill);
        
        // Assert
        verify(holdingMovementRepository).save(argThat(movement ->
            movement.getQuantityChange().equals(100L) &&
            "BUY".equals(movement.getMovementType())
        ));
    }
    
    /**
     * Test: HoldingMovement is created for SELL order with negative quantity.
     */
    @Test
    void testCreateHoldingMovement_SellOrder_NegativeQuantityChange() {
        // Arrange
        testOrder.setSide("SELL");
        Fill fill = new Fill(UUID.randomUUID(), testOrder, 100L, new BigDecimal("150.50"), Instant.now());
        
        // Act
        orderExecutionService.createHoldingMovement(testOrder, fill);
        
        // Assert
        verify(holdingMovementRepository).save(argThat(movement ->
            movement.getQuantityChange().equals(-100L) &&
            "SELL".equals(movement.getMovementType())
        ));
    }
    
    /**
     * Test: CashTransaction is created with negative amount for BUY order.
     */
    @Test
    void testCreateCashTransaction_BuyOrder_NegativeAmount() {
        // Arrange
        Fill fill = new Fill(UUID.randomUUID(), testOrder, 100L, new BigDecimal("150.50"), Instant.now());
        BigDecimal expectedAmount = new BigDecimal("150.50").multiply(new BigDecimal("100")).negate();
        
        // Act
        orderExecutionService.createCashTransaction(testOrder, fill, new BigDecimal("150.50"));
        
        // Assert
        verify(cashTransactionRepository).save(argThat(transaction ->
            transaction.getAmount().equals(expectedAmount) &&
            "BUY".equals(transaction.getTransactionType())
        ));
    }
    
    /**
     * Test: CashTransaction is created with positive amount for SELL order.
     */
    @Test
    void testCreateCashTransaction_SellOrder_PositiveAmount() {
        // Arrange
        testOrder.setSide("SELL");
        Fill fill = new Fill(UUID.randomUUID(), testOrder, 100L, new BigDecimal("150.50"), Instant.now());
        BigDecimal expectedAmount = new BigDecimal("150.50").multiply(new BigDecimal("100"));
        
        // Act
        orderExecutionService.createCashTransaction(testOrder, fill, new BigDecimal("150.50"));
        
        // Assert
        verify(cashTransactionRepository).save(argThat(transaction ->
            transaction.getAmount().equals(expectedAmount) &&
            "SELL".equals(transaction.getTransactionType())
        ));
    }
    
    /**
     * Test: Exponential backoff is applied on price tolerance failures.
     */
    @Test
    void testHandlePriceOutOfTolerance_AppliesExponentialBackoff() {
        // Arrange
        testAccount.setExecutionBufferPercent(new BigDecimal("0.01"));
        Quote expensiveQuote = new Quote(
            UUID.randomUUID(),
            testInstrument,
            new BigDecimal("200.00"),
            new BigDecimal("210.00"),
            Instant.now(),
            "SYNTHETIC_GBM",
            true
        );
        
        when(orderRepository.save(any(Order.class))).thenReturn(testOrder);
        
        Instant beforeExecution = Instant.now();
        
        // Act
        orderExecutionService.handlePriceOutOfTolerance(testOrder, expensiveQuote, new BigDecimal("210.00"));
        
        // Assert - next_execution_at should be in the future
        assertTrue(testOrder.getNextExecutionAt().isAfter(beforeExecution));
        verify(orderRepository).save(any(Order.class));
    }
    
    /**
     * Test: SELL order price within tolerance (bid >= midpoint * (1 - buffer%)).
     * BR-08 fix: SELL orders now have separate tolerance logic.
     */
    @Test
    void testIsPriceWithinTolerance_SellOrder_PriceAboveMinimum_ReturnsTrue() {
        // Arrange - Quote midpoint is 150.25, tolerance is 2%, so min acceptable is 150.25 * 0.98 = 147.245
        testOrder.setSide("SELL");
        testAccount.setExecutionBufferPercent(new BigDecimal("2.00"));
        BigDecimal executionPrice = new BigDecimal("148.00");  // Above minimum
        
        // Act
        boolean result = orderExecutionService.isPriceWithinTolerance(testOrder, testQuote, executionPrice);
        
        // Assert
        assertTrue(result);
    }
    
    /**
     * Test: SELL order price outside tolerance is rejected.
     * BR-08 fix: SELL orders reject when bid < midpoint * (1 - buffer%).
     */
    @Test
    void testIsPriceWithinTolerance_SellOrder_PriceBelowMinimum_ReturnsFalse() {
        // Arrange - Quote midpoint is 150.25, tolerance is 2%, so min acceptable is 147.245
        testOrder.setSide("SELL");
        testAccount.setExecutionBufferPercent(new BigDecimal("2.00"));
        BigDecimal executionPrice = new BigDecimal("145.00");  // Below minimum
        
        // Act
        boolean result = orderExecutionService.isPriceWithinTolerance(testOrder, testQuote, executionPrice);
        
        // Assert
        assertFalse(result);
    }
    
    /**
     * Test: SELL order at exact minimum tolerance boundary.
     */
    @Test
    void testIsPriceWithinTolerance_SellOrder_AtExactMinimum_ReturnsTrue() {
        // Arrange - Quote midpoint is 150.25, tolerance is 2%, min = 147.245
        testOrder.setSide("SELL");
        testAccount.setExecutionBufferPercent(new BigDecimal("2.00"));
        BigDecimal exactMinimum = new BigDecimal("150.25").multiply(new BigDecimal("0.98"));
        
        // Act
        boolean result = orderExecutionService.isPriceWithinTolerance(testOrder, testQuote, exactMinimum);
        
        // Assert
        assertTrue(result);
    }
    
    /**
     * Test: Fill is created with quote_id reference (BR-08 proof).
     */
    @Test
    void testExecuteOrder_SuccessfulFill_StoresQuoteProvenance() {
        // Arrange
        when(quoteRepository.findLatestByInstrumentId(testInstrument.getInstrumentId()))
            .thenReturn(Optional.of(testQuote));
        when(orderRepository.save(any(Order.class))).thenReturn(testOrder);
        
        // Act
        orderExecutionService.executeOrder(testOrder);
        
        // Assert - Fill should store quote reference for BR-08 proof
        verify(fillRepository).save(argThat(fill -> 
            fill.getQuote() != null &&
            fill.getQuote().getQuoteId().equals(testQuote.getQuoteId())
        ));
    }
    
    /**
     * Test: executeAllDueOrders processes all due orders.
     */
    @Test
    void testExecuteAllDueOrders_ProcessesMultipleOrders() {
        // Arrange
        Order order1 = new Order(UUID.randomUUID(), testAccount, testInstrument, UUID.randomUUID(), "BUY", 100L, "MARKET", "ACCEPTED");
        Order order2 = new Order(UUID.randomUUID(), testAccount, testInstrument, UUID.randomUUID(), "SELL", 50L, "MARKET", "ACCEPTED");
        
        when(orderRepository.findDueForExecution(any(Instant.class)))
            .thenReturn(List.of(order1, order2));
        when(quoteRepository.findLatestByInstrumentId(any(UUID.class)))
            .thenReturn(Optional.of(testQuote));
        
        // Act
        orderExecutionService.executeAllDueOrders();
        
        // Assert - Both orders should be processed
        verify(orderRepository).findDueForExecution(any(Instant.class));
        verify(quoteRepository, atLeast(2)).findLatestByInstrumentId(any(UUID.class));
    }
}
