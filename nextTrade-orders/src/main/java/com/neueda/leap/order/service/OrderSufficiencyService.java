package com.neueda.leap.order.service;

import com.neueda.leap.order.dto.SubmitOrderRequest;
import com.neueda.leap.order.exception.OrderSufficiencyException;
import com.neueda.leap.order.model.Quote;
import com.neueda.leap.order.repository.OrderSufficiencyRepository;
import com.neueda.leap.order.repository.QuoteRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

import static com.neueda.leap.order.exception.OrderSufficiencyException.Reason.*;

/**
 * Validates order sufficiency: verifies cash for BUY and holdings for SELL.
 * Uses the latest durable PostgreSQL ask price for BUY cost estimation.
 * Applies execution buffer from account profile or order override.
 */
@Service
public class OrderSufficiencyService {
    private final OrderSufficiencyRepository balances;
    private final QuoteRepository quotes;

    /**
     * Creates the sufficiency validator.
     *
     * @param balances cash and holdings repository
     * @param quotes quote repository for latest prices
     */
    public OrderSufficiencyService(OrderSufficiencyRepository balances, QuoteRepository quotes) {
        this.balances = balances;
        this.quotes = quotes;
    }

    /**
     * Validates that an order has sufficient cash (BUY) or holdings (SELL).
     *
     * @param request the order request
     * @param instrumentId the resolved instrument identifier
     * @throws OrderSufficiencyException if cash or holdings are insufficient, or quote is unavailable
     */
    public void validate(SubmitOrderRequest request, UUID instrumentId) {
        if ("BUY".equalsIgnoreCase(request.side())) {
            // For nextTrade-orders, bufferPercent is not in the request; always use account default
            validateBuySufficiency(request.accountId(), request.quantity(), instrumentId, null);
        } else if ("SELL".equalsIgnoreCase(request.side())) {
            validateSellSufficiency(request.accountId(), request.quantity(), instrumentId);
        }
    }

    /**
     * Validates that the account has sufficient cash for a BUY order.
     * Uses the latest ask price and applies execution buffer.
     *
     * @param accountId account identifier
     * @param quantity number of shares
     * @param instrumentId instrument identifier
     * @param bufferPercent order-specific buffer, or null to use account default
     * @throws OrderSufficiencyException if cash is insufficient or quote is unavailable
     */
    private void validateBuySufficiency(UUID accountId, long quantity, UUID instrumentId,
                                        BigDecimal bufferPercent) {
        // Fetch latest quote
        Quote quote = quotes.findLatestByInstrumentId(instrumentId)
                .orElseThrow(() -> new OrderSufficiencyException(QUOTE_UNAVAILABLE));

        // Get execution buffer (use order override if provided, else account default)
        BigDecimal buffer = bufferPercent != null ? bufferPercent
                : balances.executionBufferPercent(accountId);

        // Calculate required cash: ask × quantity × (1 + buffer%)
        BigDecimal baseCost = quote.getAsk().multiply(BigDecimal.valueOf(quantity));
        BigDecimal bufferMultiplier = BigDecimal.ONE.add(buffer.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP));
        BigDecimal requiredCash = baseCost.multiply(bufferMultiplier)
                .setScale(2, RoundingMode.CEILING);

        // Check cash balance
        BigDecimal availableCash = balances.cashBalance(accountId);
        if (availableCash.compareTo(requiredCash) < 0) {
            throw new OrderSufficiencyException(INSUFFICIENT_CASH);
        }
    }

    /**
     * Validates that the account has sufficient holdings for a SELL order.
     *
     * @param accountId account identifier
     * @param quantity number of shares
     * @param instrumentId instrument identifier
     * @throws OrderSufficiencyException if holdings are insufficient
     */
    private void validateSellSufficiency(UUID accountId, long quantity, UUID instrumentId) {
        long holdingQuantity = balances.holdingQuantity(accountId, instrumentId);
        if (holdingQuantity < quantity) {
            throw new OrderSufficiencyException(INSUFFICIENT_HOLDINGS);
        }
    }
}
