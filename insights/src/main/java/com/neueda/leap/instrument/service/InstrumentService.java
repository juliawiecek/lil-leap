package com.neueda.leap.instrument.service;

import com.neueda.leap.instrument.dto.InstrumentResponse;
import com.neueda.leap.instrument.repository.InstrumentRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/** Application service for read-only instrument discovery. */
@Service
public class InstrumentService {
    private final InstrumentRepository repository;

    /**
     * Creates a {@code InstrumentService} with the supplied dependencies.
     *
     * @param repository persistence operations used by this service
     */
    public InstrumentService(InstrumentRepository repository) {
        this.repository = repository;
    }

    /**
     * Lists the instrument catalog, including disabled and nontradable entries.
     *
     * @return instruments ordered by market code and symbol
     */
    public List<InstrumentResponse> getInstruments() {
        return repository.findAll();
    }

    /**
     * Retrieves one instrument by its persistent identifier.
     *
     * @param instrumentId persistent instrument identifier
     * @return matching instrument
     * @throws InstrumentNotFoundException if the identifier does not exist
     */
    public InstrumentResponse getInstrument(UUID instrumentId) {
        return repository.findById(instrumentId)
                .orElseThrow(() -> new InstrumentNotFoundException(instrumentId));
    }
}
