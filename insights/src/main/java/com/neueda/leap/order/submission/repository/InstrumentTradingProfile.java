package com.neueda.leap.order.submission.repository;

import java.util.UUID;

/** Instrument support and tradability flags used by NEXT-99 and NEXT-101. */
public record InstrumentTradingProfile(UUID instrumentId, boolean enabled, boolean tradable) {
}
