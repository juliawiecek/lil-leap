package com.neueda.leap.instrument.dto;

import java.util.UUID;

/** Stable API representation of a market instrument. */
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
