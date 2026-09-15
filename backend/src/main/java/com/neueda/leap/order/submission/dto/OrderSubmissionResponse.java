package com.neueda.leap.order.submission.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record OrderSubmissionResponse(
        UUID orderId,
        UUID accountId,
        UUID instrumentId,
        String symbol,
        UUID clientReference,
        String side,
        long quantity,
        String orderType,
        String status,
        Instant submittedAt,
        BigDecimal bufferPercent
) {
}
