package com.neueda.leap.order.service;

import com.neueda.leap.marketdata.QuoteRepository;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.OrderSufficiencyRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

import static com.neueda.leap.order.service.OrderSufficiencyException.Reason.*;

/**
 * Checks current resources before submission. This check neither reserves nor settles
 * funds or shares; a later acceptance/execution step must recheck and reserve atomically.
 */
@Service
public class OrderSufficiencyService {
    private final OrderSufficiencyRepository balances;
    private final QuoteRepository quotes;

    /**
     * Creates the sufficiency rule checker.
     * @param balances account-scoped cash, holdings and buffer queries
     * @param quotes server-side market quotes
     */
    public OrderSufficiencyService(OrderSufficiencyRepository balances, QuoteRepository quotes) {
        this.balances = balances;
        this.quotes = quotes;
    }

    /**
     * Requires cash for a BUY or owned units for a SELL. Buying power is the latest
     * ask times quantity times (1 + buffer / 100), rounded up to USD cents once.
     * The order override takes precedence over the account's buffer, including zero.
     *
     * @param request validated request for an account already authorized by the caller
     * @param instrumentId resolved tradable instrument
     * @throws OrderSufficiencyException if resources or a usable buy quote are missing
     * @throws IllegalArgumentException if the quantity, side or buffer is invalid
     */
    public void validate(SubmitOrderRequest request, UUID instrumentId) {
        if (request.quantity() <= 0) {
            throw new IllegalArgumentException("Quantity must be greater than zero");
        }
        switch (request.normalizedSide()) {
            case "BUY" -> validateBuy(request, instrumentId);
            case "SELL" -> {
                if (balances.holdingQuantity(request.accountId(), instrumentId) < request.quantity()) {
                    throw new OrderSufficiencyException(INSUFFICIENT_HOLDINGS);
                }
            }
            default -> throw new IllegalArgumentException("Unsupported order side");
        }
    }

    private void validateBuy(SubmitOrderRequest request, UUID instrumentId) {
        BigDecimal ask = quotes.findLatestByInstrumentId(instrumentId)
                .filter(quote -> quote.ask() != null && quote.ask().signum() > 0)
                .orElseThrow(() -> new OrderSufficiencyException(QUOTE_UNAVAILABLE)).ask();
        BigDecimal buffer = request.bufferPercent() != null ? request.bufferPercent()
                : balances.executionBufferPercent(request.accountId());
        if (buffer == null || buffer.signum() < 0) {
            throw new IllegalArgumentException("A nonnegative execution buffer is required");
        }
        BigDecimal requiredCash = ask.multiply(BigDecimal.valueOf(request.quantity()))
                .multiply(BigDecimal.ONE.add(buffer.movePointLeft(2)))
                .setScale(2, RoundingMode.CEILING);
        if (balances.cashBalance(request.accountId()).compareTo(requiredCash) < 0) {
            throw new OrderSufficiencyException(INSUFFICIENT_CASH);
        }
    }
}
