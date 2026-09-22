package com.neueda.leap.instrument.repository;

import com.neueda.leap.instrument.dto.InstrumentResponse;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Read-only persistence boundary for the instrument reference catalog. */
public interface InstrumentRepository {
    List<InstrumentResponse> findAll();

    Optional<InstrumentResponse> findById(UUID instrumentId);
}
