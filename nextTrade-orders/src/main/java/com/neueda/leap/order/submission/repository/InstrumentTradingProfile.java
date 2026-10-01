package com.neueda.leap.order.submission.repository;

import java.util.UUID;

/**
 * Instrument support and tradability flags used by NEXT-99 and NEXT-101.
 *
 * @param instrumentId persistent instrument identifier
 * @param enabled whether the instrument is enabled
 * @param tradable whether trading is permitted for the instrument
 */
public record InstrumentTradingProfile(UUID instrumentId, boolean enabled, boolean tradable) {
}
