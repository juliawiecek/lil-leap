package com.neueda.leap.order.submission.repository;

import com.neueda.leap.order.submission.dto.OrderSubmissionResponse;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

/** Persistence contract for authenticated, idempotent order submission. */
public interface OrderSubmissionRepository {
    /**
     * Checks whether the account belongs to the supplied user.
     *
     * @param accountId persistent account identifier
     * @param userId persistent user identifier
     * @return true only when the ownership relationship exists
     */
    boolean accountBelongsToUser(UUID accountId, UUID userId);
    /**
     * Reads account eligibility and USD cash balance, treating a missing balance as zero.
     *
     * @param accountId persistent account identifier
     * @return trading profile, or empty when the account does not exist
     */
    Optional<AccountTradingProfile> findAccountTradingProfile(UUID accountId);
    /**
     * Resolves an uppercase symbol, choosing the first match ordered by market code and instrument ID.
     *
     * @param symbol instrument trading symbol
     * @return instrument flags, or empty when the symbol is unsupported
     */
    Optional<InstrumentTradingProfile> findInstrumentTradingProfileBySymbol(String symbol);
    /**
     * Looks up an earlier submission using the account-scoped idempotency key.
     *
     * @param accountId persistent account identifier
     * @param clientReference caller-supplied idempotency key, scoped to the account
     * @return existing order, or empty when the key has not been used
     */
    Optional<OrderSubmissionResponse> findByAccountAndClientReference(UUID accountId, UUID clientReference);
    /**
     * Inserts a SUBMITTED order without overwriting an existing account/client-reference pair.
     *
     * @param accountId persistent account identifier
     * @param instrumentId persistent instrument identifier
     * @param symbol instrument trading symbol
     * @param clientReference caller-supplied idempotency key, scoped to the account
     * @param side order side, BUY or SELL
     * @param quantity number of units in the order
     * @param orderType order type, such as MARKET
     * @param bufferPercent order-specific execution tolerance percentage, or null to use the account default
     * @return inserted order, or empty when the idempotency key conflicts
     */
    Optional<OrderSubmissionResponse> insert(UUID accountId, UUID instrumentId, String symbol,
            UUID clientReference, String side, long quantity, String orderType, BigDecimal bufferPercent);
}
