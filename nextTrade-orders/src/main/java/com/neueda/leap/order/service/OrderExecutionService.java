package com.neueda.leap.order.service;

import com.neueda.leap.order.model.*;
import com.neueda.leap.order.repository.*;
import jakarta.transaction.Transactional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Processes due orders using current bid/ask quotes and a midpoint tolerance.
 * BUY orders use ask; other sides use bid. The order buffer overrides the account buffer.
 * Missing quotes retry after ten seconds and stale quotes after five, without increasing
 * the tolerance-failure count. Out-of-tolerance prices retry with capped exponential
 * backoff and reject on the tenth tolerance failure. A fill writes cash and holdings
 * ledger entries and a status-history record.
 *
 * <p>The batch method calls execution methods on this instance. Their transactional
 * annotations require invocation through a transaction interceptor; internal calls alone
 * do not create a Spring proxy transaction.</p>
 */
@Slf4j
@Service
public class OrderExecutionService {
    
    private final OrderRepository orderRepository;
    private final QuoteRepository quoteRepository;
    private final FillRepository fillRepository;
    private final OrderStatusHistoryRepository statusHistoryRepository;
    private final HoldingMovementRepository holdingMovementRepository;
    private final CashTransactionRepository cashTransactionRepository;
    
    // Configuration (injected from application.yml)
    @Value("${orders.execution.max-quote-age-seconds:60}")
    private long maxQuoteAgeSeconds;
    
    private static final long MAX_EXECUTION_ATTEMPTS = 10;

    /**
     * Creates a {@code OrderExecutionService} with the supplied dependencies.
     *
     * @param orderRepository order repository
     * @param quoteRepository quote repository
     * @param fillRepository fill repository
     * @param statusHistoryRepository status history repository
     * @param holdingMovementRepository holding movement repository
     * @param cashTransactionRepository cash transaction repository
     */
    public OrderExecutionService(OrderRepository orderRepository,
                                QuoteRepository quoteRepository,
                                FillRepository fillRepository,
                                OrderStatusHistoryRepository statusHistoryRepository,
                                HoldingMovementRepository holdingMovementRepository,
                                CashTransactionRepository cashTransactionRepository) {
        this.orderRepository = orderRepository;
        this.quoteRepository = quoteRepository;
        this.fillRepository = fillRepository;
        this.statusHistoryRepository = statusHistoryRepository;
        this.holdingMovementRepository = holdingMovementRepository;
        this.cashTransactionRepository = cashTransactionRepository;
    }
    
    /**
     * Execute all orders that are due for execution.
     * This is called periodically by a scheduled task.
     */
    public void executeAllDueOrders() {
        var dueOrders = orderRepository.findDueForExecution(Instant.now());
        log.info("Found {} orders due for execution", dueOrders.size());
        
        for (Order order : dueOrders) {
            try {
                executeOrder(order);
            } catch (Exception e) {
                log.error("Error executing order {}: {}", order.getOrderId(), e.getMessage(), e);
            }
        }
    }
    
    /**
     * Attempts to fill an order using the latest quote.
     * A missing or stale quote defers execution; an out-of-tolerance price retries or rejects.
     * A successful attempt persists a fill, settlement ledger entries and FILLED status.
     *
     * @param order order with populated account, instrument, side, quantity and attempt count
     */
    @Transactional
    public void executeOrder(Order order) {
        log.info("Executing order {} for instrument {}", order.getOrderId(), order.getInstrument().getSymbol());
        
        // Step 1: Get latest quote for instrument
        var quote = quoteRepository.findLatestByInstrumentId(order.getInstrument().getInstrumentId());
        
        if (quote.isEmpty()) {
            handleNoQuoteAvailable(order);
            return;
        }
        
        Quote currentQuote = quote.get();
        
        // Step 2: Validate quote freshness (not stale)
        if (isQuoteStale(currentQuote)) {
            handleStaleQuote(order, currentQuote);
            return;
        }
        
        // Step 3: Validate price within tolerance buffer
        BigDecimal executionPrice = getExecutionPrice(order, currentQuote);
        
        if (!isPriceWithinTolerance(order, currentQuote, executionPrice)) {
            handlePriceOutOfTolerance(order, currentQuote, executionPrice);
            return;
        }
        
        // Step 4: Execute the fill
        executeFill(order, currentQuote, executionPrice);
    }
    
    /**
     * Execute a fill for an order.
     * AC2: Filled orders record execution details.
     *
     * @param order order being executed
     * @param quote selected quote, or null when unavailable
     * @param executionPrice execution price per unit
     */
    @Transactional
    protected void executeFill(Order order, Quote quote, BigDecimal executionPrice) {
        log.info("Filling order {} at price {}", order.getOrderId(), executionPrice);
        
        // Create Fill record (AC2: record execution details)
        // BR-08 proof: Store quote_id to prove price was from a current market quote
        Fill fill = new Fill(
            UUID.randomUUID(),
            order,
            order.getQuantity(),
            executionPrice,
            quote.getQuotedAt(),
            quote
        );
        fillRepository.save(fill);
        
        // Create settlement ledger entries
        createHoldingMovement(order, fill);
        createCashTransaction(order, fill, executionPrice);
        
        // Update order status to FILLED
        order.setStatus("FILLED");
        order.setUpdatedAt(Instant.now());
        orderRepository.save(order);
        
        // Record status history
        recordStatusHistory(order, "FILLED", "EXECUTION_SUCCESS", "Order filled at " + executionPrice);
        
        log.info("Order {} filled successfully", order.getOrderId());
    }
    
    /**
     * Create a holding movement for the fill.
     * BR-09: Every fill creates an immutable holding movement (ledger entry).
     *
     * @param order order being executed
     * @param fill fill associated with this ledger entry
     */
    protected void createHoldingMovement(Order order, Fill fill) {
        long quantityChange;
        String movementType;
        
        if ("BUY".equalsIgnoreCase(order.getSide())) {
            quantityChange = order.getQuantity();
            movementType = "BUY";
        } else {
            quantityChange = -order.getQuantity();
            movementType = "SELL";
        }
        
        HoldingMovement movement = new HoldingMovement(
            UUID.randomUUID(),
            order.getAccount(),
            order.getInstrument(),
            fill,
            quantityChange,
            fill.getExecutionPrice(),
            movementType
        );
        holdingMovementRepository.save(movement);
        log.debug("Created holding movement for order {}", order.getOrderId());
    }
    
    /**
     * Create cash transaction for the fill.
     * BR-09: Every fill creates an immutable cash transaction (ledger entry).
     * Negative amount for BUY (outflow), positive for SELL (inflow).
     *
     * @param order order being executed
     * @param fill fill associated with this ledger entry
     * @param executionPrice execution price per unit
     */
    protected void createCashTransaction(Order order, Fill fill, BigDecimal executionPrice) {
        BigDecimal totalCost = executionPrice.multiply(new BigDecimal(order.getQuantity()));
        BigDecimal amount;
        String transactionType;
        
        if ("BUY".equalsIgnoreCase(order.getSide())) {
            amount = totalCost.negate();  // Negative for outflow
            transactionType = "BUY";
        } else {
            amount = totalCost;  // Positive for inflow
            transactionType = "SELL";
        }
        
        CashTransaction transaction = new CashTransaction(
            UUID.randomUUID(),
            order.getAccount(),
            fill,
            transactionType,
            amount,
            "USD"
        );
        cashTransactionRepository.save(transaction);
        log.debug("Created cash transaction for order {} with amount {}", order.getOrderId(), amount);
    }
    
    /**
     * Handle case where no quote is available.
     * Schedule retry without incrementing final attempt count.
     *
     * @param order order being executed
     */
    protected void handleNoQuoteAvailable(Order order) {
        log.warn("No quote available for order {}, scheduling retry", order.getOrderId());
        order.setLastExecutionError("NO_QUOTE");
        order.setNextExecutionAt(Instant.now().plusSeconds(10));  // Retry in 10 seconds
        orderRepository.save(order);
        recordStatusHistory(order, order.getStatus(), "NO_QUOTE", "No quote available for execution");
    }
    
    /**
     * Schedules a retry after five seconds without increasing the tolerance-failure count.
     * Freshness uses {@code orders.execution.max-quote-age-seconds}, defaulting to 60.
     *
     * @param order order to reschedule
     * @param quote stale quote used for diagnostics
     */
    protected void handleStaleQuote(Order order, Quote quote) {
        log.warn("Stale quote for order {} (quote age: {} seconds)", 
                 order.getOrderId(), getQuoteAgeSeconds(quote));
        order.setLastExecutionError("STALE_QUOTE");
        order.setNextExecutionAt(Instant.now().plusSeconds(5));  // Retry in 5 seconds
        orderRepository.save(order);
        recordStatusHistory(order, order.getStatus(), "STALE_QUOTE", 
                           "Quote is stale, retrying execution");
    }
    
    /**
     * Handle case where price is outside tolerance buffer.
     * Increment attempt counter and reject if max attempts exceeded.
     *
     * @param order order being executed
     * @param quote selected quote, or null when unavailable
     * @param executionPrice execution price per unit
     */
    protected void handlePriceOutOfTolerance(Order order, Quote quote, BigDecimal executionPrice) {
        log.warn("Price out of tolerance for order {}: quote={}, execution={}", 
                 order.getOrderId(), quote.getMidpoint(), executionPrice);
        
        order.setExecutionAttempts(order.getExecutionAttempts() + 1);
        order.setLastExecutionError("PRICE_OUT_OF_TOLERANCE");
        
        if (order.getExecutionAttempts() >= MAX_EXECUTION_ATTEMPTS) {
            order.setStatus("REJECTED");
            recordStatusHistory(order, "REJECTED", "PRICE_OUT_OF_TOLERANCE",
                               "Price out of tolerance after " + MAX_EXECUTION_ATTEMPTS + " attempts");
            log.warn("Order {} rejected after {} failed attempts", order.getOrderId(), MAX_EXECUTION_ATTEMPTS);
        } else {
            // Exponential backoff for retry
            long backoffSeconds = Math.min(300, (long) Math.pow(2, order.getExecutionAttempts()));
            order.setNextExecutionAt(Instant.now().plusSeconds(backoffSeconds));
            recordStatusHistory(order, "PENDING", "PRICE_OUT_OF_TOLERANCE",
                               "Attempt " + order.getExecutionAttempts() + " failed, retrying");
            log.info("Order {} attempt {} failed, retrying in {} seconds", 
                     order.getOrderId(), order.getExecutionAttempts(), backoffSeconds);
        }
        
        order.setUpdatedAt(Instant.now());
        orderRepository.save(order);
    }
    
    /**
     * Determine execution price based on order side and quote.
     * For BUY: use ASK price (seller's price)
     * For SELL: use BID price (buyer's price)
     *
     * @param order order being executed
     * @param quote selected quote, or null when unavailable
     * @return ask for BUY, otherwise bid
     */
    protected BigDecimal getExecutionPrice(Order order, Quote quote) {
        if ("BUY".equalsIgnoreCase(order.getSide())) {
            return quote.getAsk();
        } else {
            return quote.getBid();
        }
    }
    
    /**
     * Validate price is within tolerance buffer.
     * BR-08: Execution price must be within tolerance of the midpoint.
     *
     * Tolerance = account's execution_buffer_percent (or order's buffer_percent if set).
     * For BUY orders:  ask &lt;= midpoint × (1 + buffer% / 100)
     * For SELL orders: bid >= midpoint × (1 - buffer% / 100)
     *
     * @param order order being executed
     * @param quote selected quote, or null when unavailable
     * @param executionPrice execution price per unit
     * @return whether the side-specific execution price is within the midpoint tolerance
     */
    protected boolean isPriceWithinTolerance(Order order, Quote quote, BigDecimal executionPrice) {
        BigDecimal tolerance = order.getBufferPercent() != null 
            ? order.getBufferPercent() 
            : order.getAccount().getExecutionBufferPercent();
        
        BigDecimal midpoint = quote.getMidpoint();
        BigDecimal toleranceDecimal = tolerance.divide(new BigDecimal("100"), 8, java.math.RoundingMode.HALF_UP);
        
        if ("BUY".equalsIgnoreCase(order.getSide())) {
            // BUY: execution price (ask) must not exceed midpoint * (1 + buffer%)
            BigDecimal maxAcceptablePrice = midpoint.multiply(BigDecimal.ONE.add(toleranceDecimal));
            return executionPrice.compareTo(maxAcceptablePrice) <= 0;
        } else {
            // SELL: execution price (bid) must be at least midpoint * (1 - buffer%)
            BigDecimal minAcceptablePrice = midpoint.multiply(BigDecimal.ONE.subtract(toleranceDecimal));
            return executionPrice.compareTo(minAcceptablePrice) >= 0;
        }
    }
    
    /**
     * Check if quote is stale (older than maxQuoteAgeSeconds configuration).
     *
     * @param quote selected quote, or null when unavailable
     * @return true when quote age exceeds the configured maximum age
     */
    protected boolean isQuoteStale(Quote quote) {
        return getQuoteAgeSeconds(quote) > maxQuoteAgeSeconds;
    }
    
    /**
     * Get age of quote in seconds using database quoted_at timestamp.
     *
     * @param quote selected quote, or null when unavailable
     * @return whole seconds from the quote timestamp to the current instant
     */
    protected long getQuoteAgeSeconds(Quote quote) {
        // Use server/database UTC time comparison
        return java.time.temporal.ChronoUnit.SECONDS.between(quote.getQuotedAt(), Instant.now());
    }
    
    /**
     * Record status change in order_status_history (audit trail).
     * AC3: Rejected orders record rejection reasons.
     *
     * @param order order being executed
     * @param status persisted order lifecycle status
     * @param reasonCode machine-readable outcome code
     * @param reasonText human-readable outcome explanation
     */
    protected void recordStatusHistory(Order order, String status, String reasonCode, String reasonText) {
        OrderStatusHistory history = new OrderStatusHistory(
            UUID.randomUUID(),
            order,
            status,
            reasonCode,
            reasonText
        );
        statusHistoryRepository.save(history);
        log.debug("Recorded status history for order {}: status={}, reason={}", 
                  order.getOrderId(), status, reasonCode);
    }
}
