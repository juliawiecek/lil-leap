package com.neueda.leap.order.execution.quote;

import com.neueda.leap.marketdata.MarketQuote;
import java.time.OffsetDateTime;
import java.util.Optional;

/**
 * Quote evidence and action to be consumed by the fill executor.
 *
 * @param action next action for the fill executor
 * @param reason machine-readable decision reason
 * @param quote selected quote, or null when unavailable
 * @param evaluatedAt instant at which freshness is evaluated
 */
public record ExecutionQuoteDecision(
        Action action, Reason reason, MarketQuote quote, OffsetDateTime evaluatedAt) {
    /**
     * Exposes the quote evidence without a nullable return value.
     *
     * @return selected quote, or empty when none was available
     */
    public Optional<MarketQuote> selectedQuote() {
        return Optional.ofNullable(quote);
    }

    /** Action requested after inspecting execution quote evidence. */
    public enum Action {
        /** Proceed to fill pricing using the selected fresh quote. */
        CONTINUE,
        /** Retry quote selection on a later attempt. */
        REQUEUE,
        /** Stop retrying after reaching the quote attempt limit. */
        REJECT
    }

    /** Stable reason code describing the rule or quote decision. */
    public enum Reason {
        /** The quote timestamp is within the freshness limits. */
        QUOTE_FRESH,
        /** No quote exists for the instrument. */
        QUOTE_UNAVAILABLE,
        /** The quote exceeds the maximum permitted age. */
        STALE_QUOTE,
        /** The quote timestamp exceeds the allowed future skew. */
        INVALID_QUOTE_TIMESTAMP
    }
}
