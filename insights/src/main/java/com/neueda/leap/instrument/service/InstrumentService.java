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

    public InstrumentService(InstrumentRepository repository) {
        this.repository = repository;
    }

    public List<InstrumentResponse> getInstruments() {
        return repository.findAll();
    }

    public InstrumentResponse getInstrument(UUID instrumentId) {
        return repository.findById(instrumentId)
                .orElseThrow(() -> new InstrumentNotFoundException(instrumentId));
    }
}
