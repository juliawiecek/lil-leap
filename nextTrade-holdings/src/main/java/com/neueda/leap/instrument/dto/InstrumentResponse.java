package com.neueda.leap.instrument.dto;

import java.util.UUID;

/**
 * Stable API representation of a market instrument.
 *
 * @param instrumentId persistent instrument identifier
 * @param symbol instrument trading symbol
 * @param instrumentName instrument name
 * @param assetClass instrument asset class
 * @param marketCode market identifier
 * @param currency currency code
 * @param sector sector
 * @param enabled whether the instrument is enabled
 * @param tradable whether trading is permitted for the instrument
 */
public record InstrumentResponse(
        UUID instrumentId,
        String symbol,
        String instrumentName,
        String assetClass,
        String marketCode,
        String currency,
        String sector,
        boolean enabled,
        boolean tradable
) {
}
