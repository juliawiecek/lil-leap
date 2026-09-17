package com.neueda.leap.order.submission.repository;

import com.neueda.leap.order.submission.dto.OrderSubmissionResponse;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

/** Persistence contract for order submission; order operations do not authorize callers. */
public interface OrderSubmissionRepository {
    /**
     * Checks ownership without revealing whether a foreign account exists.
     * @param accountId requested account
     * @param userId authenticated user's identifier
     * @return true only if the account belongs to that user
     */
    boolean accountBelongsToUser(UUID accountId, UUID userId);

    /**
     * Resolves an enabled, tradable instrument.
     * @param symbol normalized uppercase symbol
     * @return the instrument identifier, or empty when none is eligible
     */
    Optional<UUID> findTradableInstrumentIdBySymbol(String symbol);

    /**
     * Finds a previous submission after the caller has checked account ownership.
     * @param accountId authorized account
     * @param clientReference account-scoped retry key
     * @return the stored order, or empty when it has not been submitted
     */
    Optional<OrderSubmissionResponse> findByAccountAndClientReference(UUID accountId, UUID clientReference);

    /**
     * Attempts to insert a SUBMITTED order without executing it or reserving funds.
     * A concurrent duplicate returns empty instead of aborting the transaction;
     * the caller must then read the existing order.
     * @param accountId account whose ownership has already been checked
     * @param instrumentId resolved tradable instrument
     * @param symbol normalized symbol used in the returned response
     * @param clientReference account-scoped retry key
     * @param side normalized BUY or SELL
     * @param quantity positive whole-unit quantity
     * @param orderType normalized order type
     * @param bufferPercent optional buffer percentage; may be null
     * @return the inserted order, or empty on a duplicate account/reference pair
     */
    Optional<OrderSubmissionResponse> insert(UUID accountId, UUID instrumentId, String symbol,
                                   UUID clientReference, String side, long quantity,
                                   String orderType, BigDecimal bufferPercent);
}
