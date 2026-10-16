package com.neueda.leap.instrument.service;

import com.neueda.leap.instrument.dto.InstrumentResponse;
import com.neueda.leap.instrument.repository.InstrumentRepository;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class InstrumentServiceTest {
    private final InstrumentRepository repository = mock(InstrumentRepository.class);
    private final InstrumentService service = new InstrumentService(repository);

    @Test
    void listsRepositoryInstruments() {
        InstrumentResponse instrument = instrument(UUID.randomUUID());
        when(repository.findAll()).thenReturn(List.of(instrument));

        assertEquals(List.of(instrument), service.getInstruments());
    }

    @Test
    void returnsInstrumentById() {
        UUID id = UUID.randomUUID();
        InstrumentResponse instrument = instrument(id);
        when(repository.findById(id)).thenReturn(Optional.of(instrument));

        assertEquals(instrument, service.getInstrument(id));
    }

    @Test
    void rejectsUnknownInstrumentId() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.empty());

        assertThrows(InstrumentNotFoundException.class, () -> service.getInstrument(id));
    }

    private static InstrumentResponse instrument(UUID id) {
        return new InstrumentResponse(id, "AAPL", "Apple Inc.", "COMMON_STOCK",
                "NASDAQ", "USD", "Technology", true, true);
    }
}
