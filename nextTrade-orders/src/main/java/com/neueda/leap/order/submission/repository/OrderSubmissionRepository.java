package com.neueda.leap.order.submission.repository;

import com.neueda.leap.order.submission.dto.OrderSubmissionResponse;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
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
     * Reads the declared country from the profile of the user who owns the account.
     *
     * @param accountId persistent account identifier
     * @return the country as entered, or empty when there is no profile or no country
     */
    Optional<String> findClientCountry(UUID accountId);
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
     * @param request validated order submission, normalized before persistence
     * @param instrumentId resolved persistent instrument identifier
     * @param symbol resolved instrument trading symbol
     * @return inserted order, or empty when the idempotency key conflicts
     */
    Optional<OrderSubmissionResponse> insert(SubmitOrderRequest request, UUID instrumentId, String symbol);
}
