package com.neueda.leap.order.service;

import com.neueda.leap.order.model.*;
import com.neueda.leap.order.repository.*;
import jakarta.transaction.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Processes due orders using current bid/ask quotes and a midpoint tolerance.
 * BUY orders use ask; other sides use bid. The order buffer overrides the account buffer.
 * Missing quotes retry after ten seconds and stale quotes after five, without increasing
 * the tolerance-failure count. Out-of-tolerance prices retry with capped exponential
 * backoff and reject on the tenth tolerance failure. A fill writes cash and holdings
 * ledger entries, updates the holdings/cash_balances caches, and a status-history
 * record, all in the same transaction (BR-09, per the TS-10.1 ADR).
 *
 * <p>The batch method invokes {@link #executeOrder(Order)} through {@link #self},
 * a proxy reference injected by Spring after construction, rather than directly
 * on this instance: a same-instance ("self-invocation") call bypasses Spring's
 * transactional proxy entirely, so {@code @Transactional} would silently not
 * apply. {@link #self} defaults to {@code this} so unit tests that construct
 * this class directly (with no Spring proxy in play) are unaffected.</p>
 */
@Service
public class OrderExecutionService {

    private static final Logger log = LoggerFactory.getLogger(OrderExecutionService.class);

    private final OrderRepository orderRepository;
    private final QuoteRepository quoteRepository;
    private final FillRepository fillRepository;
    private final OrderStatusHistoryRepository statusHistoryRepository;
    private final HoldingMovementRepository holdingMovementRepository;
    private final CashTransactionRepository cashTransactionRepository;
    private final OrderAccountRepository accountRepository;
    private final HoldingRepository holdingRepository;
    private final CashBalanceRepository cashBalanceRepository;

    private OrderExecutionService self;

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
     * @param accountRepository account repository, used to lock the account row before settlement
     * @param holdingRepository holdings cache repository
     * @param cashBalanceRepository cash balance cache repository
     */
    public OrderExecutionService(OrderRepository orderRepository,
                                QuoteRepository quoteRepository,
                                FillRepository fillRepository,
                                OrderStatusHistoryRepository statusHistoryRepository,
                                HoldingMovementRepository holdingMovementRepository,
                                CashTransactionRepository cashTransactionRepository,
                                OrderAccountRepository accountRepository,
                                HoldingRepository holdingRepository,
                                CashBalanceRepository cashBalanceRepository) {
        this.orderRepository = orderRepository;
        this.quoteRepository = quoteRepository;
        this.fillRepository = fillRepository;
        this.statusHistoryRepository = statusHistoryRepository;
        this.holdingMovementRepository = holdingMovementRepository;
        this.cashTransactionRepository = cashTransactionRepository;
        this.accountRepository = accountRepository;
        this.holdingRepository = holdingRepository;
        this.cashBalanceRepository = cashBalanceRepository;
        this.self = this;
    }

    /**
     * Replaces the self-reference with Spring's transactional proxy for this
     * bean, so calls from {@link #executeAllDueOrders()} participate in
     * {@code @Transactional} correctly. {@code @Lazy} breaks the circular
     * dependency this would otherwise create at startup.
     *
     * @param self the proxied bean for this class
     */
    @Autowired
    public void setSelf(@Lazy OrderExecutionService self) {
        this.self = self;
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
                self.executeOrder(order);
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

        // Idempotency (TS-10.1 ADR §4.3): a fill may already exist for this
        // order (retry after a transient failure, a duplicate scheduler tick).
        // Never create a second one - fills.order_id is UNIQUE at the schema
        // level too, but checking first avoids relying on a thrown constraint
        // violation and gives a clean no-op instead.
        if (fillRepository.findByOrderOrderId(order.getOrderId()).isPresent()) {
            log.info("Order {} already has a fill; skipping duplicate settlement", order.getOrderId());
            return;
        }

        // Lock the account row before touching its cash/holdings caches, so
        // two settlements against the same account cannot interleave
        // (TS-10.1 ADR §4, step 2: order, then account, then cash/holdings).
        Account lockedAccount = accountRepository.findWithLockByAccountId(order.getAccount().getAccountId())
                .orElseThrow(() -> new IllegalStateException(
                        "Account " + order.getAccount().getAccountId() + " referenced by order "
                                + order.getOrderId() + " does not exist"));

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

        // BR-09/BR-10: update the holdings and cash_balances caches in the
        // same transaction as the ledger writes above, so a client-facing
        // read (NEXT-115/199) can never observe a settled fill whose caches
        // haven't caught up.
        applyHoldingToCache(lockedAccount, order.getInstrument(), order.getSide(), order.getQuantity(), executionPrice);
        applyCashToCache(lockedAccount, computeCashAmount(order, executionPrice));

        // Update order status to FILLED
        order.setStatus("FILLED");
        order.setUpdatedAt(Instant.now());
        orderRepository.save(order);

        // Record status history
        recordStatusHistory(order, "FILLED", "EXECUTION_SUCCESS", "Order filled at " + executionPrice);

        log.info("Order {} filled successfully", order.getOrderId());
    }

    /**
     * Returns the settlement record for one fill, per the TS-10.1 ADR's
     * {@code getSettlement(settlementId)} contract, where settlementId is
     * fills.fill_id. Read-only; performs no writes.
     *
     * @param fillId persistent fill identifier
     * @return the fill and its associated order/quote, or empty when not found
     */
    public Optional<Fill> getSettlement(UUID fillId) {
        return fillRepository.findById(fillId);
    }

    /**
     * Updates the holdings cache for one account/instrument after a fill,
     * using moving weighted-average cost (TS-10.1 ADR §4): a BUY blends the
     * new units into the average cost; a SELL reduces quantity while leaving
     * average cost unchanged, resetting it to zero only on full liquidation.
     *
     * @param account locked account the fill belongs to
     * @param instrument instrument traded
     * @param side BUY or SELL
     * @param filledQuantity units filled
     * @param executionPrice price per unit the fill executed at
     */
    protected void applyHoldingToCache(Account account, Instrument instrument, String side,
                                        Long filledQuantity, BigDecimal executionPrice) {
        Holding holding = holdingRepository
                .findByAccountIdAndInstrumentId(account.getAccountId(), instrument.getInstrumentId())
                .orElseGet(() -> new Holding(account.getAccountId(), instrument.getInstrumentId()));

        long currentQuantity = holding.getQuantity();
        BigDecimal currentAvgCost = holding.getAvgCost();

        if ("BUY".equalsIgnoreCase(side)) {
            long newQuantity = currentQuantity + filledQuantity;
            BigDecimal existingCost = currentAvgCost.multiply(BigDecimal.valueOf(currentQuantity));
            BigDecimal addedCost = executionPrice.multiply(BigDecimal.valueOf(filledQuantity));
            BigDecimal newAvgCost = newQuantity == 0
                    ? BigDecimal.ZERO
                    : existingCost.add(addedCost).divide(BigDecimal.valueOf(newQuantity), 8, RoundingMode.HALF_UP);
            holding.setQuantity(newQuantity);
            holding.setAvgCost(newAvgCost);
        } else {
            long newQuantity = currentQuantity - filledQuantity;
            holding.setQuantity(newQuantity);
            holding.setAvgCost(newQuantity == 0 ? BigDecimal.ZERO : currentAvgCost);
        }

        holding.setUpdatedAt(Instant.now());
        holdingRepository.save(holding);
    }

    /**
     * Updates the cash_balances cache for one account after a fill, applying
     * the same signed amount written to the cash_transactions ledger.
     *
     * @param account locked account the fill belongs to
     * @param signedAmount negative for BUY, positive for SELL
     */
    protected void applyCashToCache(Account account, BigDecimal signedAmount) {
        CashBalance cashBalance = cashBalanceRepository.findByAccountId(account.getAccountId())
                .orElseGet(() -> {
                    CashBalance created = new CashBalance();
                    created.setAccount(account);
                    created.setCurrency("USD");
                    created.setBalance(BigDecimal.ZERO);
                    return created;
                });

        cashBalance.setBalance(cashBalance.getBalance().add(signedAmount));
        cashBalance.setUpdatedAt(Instant.now());
        cashBalanceRepository.save(cashBalance);
    }

    /**
     * Signed cash amount for a fill: negative for BUY (outflow), positive for
     * SELL (inflow). Shared by the ledger write and the cache update so the
     * two can never disagree.
     *
     * @param order order being executed
     * @param executionPrice execution price per unit
     * @return the signed total cash amount for this fill
     */
    private static BigDecimal computeCashAmount(Order order, BigDecimal executionPrice) {
        BigDecimal totalCost = executionPrice.multiply(new BigDecimal(order.getQuantity()));
        return "BUY".equalsIgnoreCase(order.getSide()) ? totalCost.negate() : totalCost;
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
        BigDecimal amount = computeCashAmount(order, executionPrice);
        String transactionType = "BUY".equalsIgnoreCase(order.getSide()) ? "BUY" : "SELL";

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
