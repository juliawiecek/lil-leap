package com.neueda.leap.order.submission.repository;

import com.neueda.leap.order.submission.dto.OrderSubmissionResponse;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

/** Persistence contract for authenticated, idempotent order submission. */
public interface OrderSubmissionRepository {
    boolean accountBelongsToUser(UUID accountId, UUID userId);
    Optional<AccountTradingProfile> findAccountTradingProfile(UUID accountId);
    Optional<InstrumentTradingProfile> findInstrumentTradingProfileBySymbol(String symbol);
    Optional<OrderSubmissionResponse> findByAccountAndClientReference(UUID accountId, UUID clientReference);
    Optional<OrderSubmissionResponse> insert(UUID accountId, UUID instrumentId, String symbol,
            UUID clientReference, String side, long quantity, String orderType, BigDecimal bufferPercent);
}
