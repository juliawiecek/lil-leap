package com.neueda.leap.order.service;

import com.neueda.leap.marketdata.QuoteRepository;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.OrderSufficiencyRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Locale;
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
                long held = balances.holdingQuantity(request.accountId(), instrumentId);
                if (held < request.quantity()) {
                    throw new OrderSufficiencyException(INSUFFICIENT_HOLDINGS, String.format(Locale.US,
                            "Insufficient holdings: this order sells %,d shares but you hold %,d.",
                            request.quantity(), held));
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
        BigDecimal available = balances.cashBalance(request.accountId());
        if (available.compareTo(requiredCash) < 0) {
            throw new OrderSufficiencyException(INSUFFICIENT_CASH, String.format(Locale.US,
                    "Insufficient cash: this order needs %s (%,d shares at the %s ask plus a %s%% price buffer), "
                            + "but %s is available.",
                    usd(requiredCash), request.quantity(), usd(ask),
                    buffer.stripTrailingZeros().toPlainString(), usd(available)));
        }
    }

    /** Formats a USD amount for messages, e.g. $1,250.00. */
    private static String usd(BigDecimal amount) {
        return String.format(Locale.US, "$%,.2f", amount);
    }
}
