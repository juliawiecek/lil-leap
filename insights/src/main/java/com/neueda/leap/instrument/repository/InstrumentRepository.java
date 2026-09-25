package com.neueda.leap.instrument.repository;

import com.neueda.leap.instrument.dto.InstrumentResponse;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Read-only persistence boundary for the instrument reference catalog. */
public interface InstrumentRepository {
    /**
     * Lists the instrument catalog, including disabled and nontradable entries.
     *
     * @return instruments ordered by market code and symbol
     */
    List<InstrumentResponse> findAll();

    /**
     * Finds an instrument by its persistent identifier.
     *
     * @param instrumentId persistent instrument identifier
     * @return matching instrument, or empty when absent
     */
    Optional<InstrumentResponse> findById(UUID instrumentId);
}
