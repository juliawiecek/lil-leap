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

    /**
     * Resolves a canonical uppercase symbol, including disabled and nontradable entries.
     * Matches are ordered by market code and instrument ID, as in order submission.
     * @param symbol uppercase instrument symbol
     * @return matching instrument, or empty when absent
     */
    Optional<InstrumentResponse> findBySymbol(String symbol);

    /**
     * Searches for instruments by partial symbol or name match (case-insensitive).
     * Returns up to 100 results to avoid overwhelming the API.
     * Empty query returns an empty list, not an error.
     * 
     * @param query search query: partial symbol or name match (case-insensitive)
     * @return matching instruments ordered by symbol, limited to 100 results
     */
    List<InstrumentResponse> searchBySymbolOrName(String query);
}
