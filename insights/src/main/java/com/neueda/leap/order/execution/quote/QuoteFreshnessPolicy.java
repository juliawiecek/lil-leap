package com.neueda.leap.order.execution.quote;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Objects;

/**
 * Validates quote timestamps against the execution instant. Age and future-skew boundaries are
 * inclusive; this policy does not inspect quote prices.
 */
public class QuoteFreshnessPolicy {
    private final Duration maximumAge, allowedFutureSkew;

    /**
     * Creates a quote timestamp policy with explicit age and future-skew limits.
     *
     * @param maximumAge positive maximum permitted quote age
     * @param allowedFutureSkew nonnegative allowance for future quote timestamps
     * @throws IllegalArgumentException if either duration is null, age is not positive or skew is negative
     */
    public QuoteFreshnessPolicy(Duration maximumAge, Duration allowedFutureSkew) {
        if (maximumAge == null || maximumAge.isZero() || maximumAge.isNegative())
            throw new IllegalArgumentException("Maximum quote age must be positive");
        if (allowedFutureSkew == null || allowedFutureSkew.isNegative())
            throw new IllegalArgumentException("Allowed future skew cannot be negative");
        this.maximumAge = maximumAge;
        this.allowedFutureSkew = allowedFutureSkew;
    }

    /**
     * Classifies a quote timestamp. The maximum age and future-skew boundaries are inclusive.
     * Future timestamps within the skew allowance have an effective age of zero.
     *
     * @param quotedAt timestamp supplied by the quote source
     * @param evaluatedAt instant at which freshness is evaluated
     * @return freshness classification
     * @throws NullPointerException if either timestamp is null
     */
    public Freshness evaluate(OffsetDateTime quotedAt, OffsetDateTime evaluatedAt) {
        Objects.requireNonNull(quotedAt);
        Objects.requireNonNull(evaluatedAt);
        if (quotedAt.isAfter(evaluatedAt.plus(allowedFutureSkew)))
            return Freshness.INVALID_FUTURE_TIMESTAMP;
        Duration age = Duration.between(quotedAt, evaluatedAt);
        if (age.isNegative()) age = Duration.ZERO;
        return age.compareTo(maximumAge) <= 0 ? Freshness.FRESH : Freshness.STALE;
    }

    /** Timestamp classification relative to the configured age and clock-skew limits. */
    public enum Freshness {
        /** The quote is within both timestamp limits. */
        FRESH,
        /** The quote is older than the maximum permitted age. */
        STALE,
        /** The quote is too far in the future. */
        INVALID_FUTURE_TIMESTAMP
    }
}
