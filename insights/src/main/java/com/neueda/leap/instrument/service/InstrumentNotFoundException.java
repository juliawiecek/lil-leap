package com.neueda.leap.instrument.service;

import java.util.UUID;

/** Raised when an instrument identifier does not exist. */
public class InstrumentNotFoundException extends RuntimeException {
    public InstrumentNotFoundException(UUID instrumentId) {
        super("Instrument not found: " + instrumentId);
    }
}
