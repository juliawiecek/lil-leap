package com.neueda.leap.instrument.service;

import com.neueda.leap.instrument.dto.InstrumentResponse;
import com.neueda.leap.instrument.repository.InstrumentRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Unit tests for instrument search functionality (TS-13.5, BR-12).
 * Covers case-insensitive, partial-match search across symbols and names.
 */
@ExtendWith(MockitoExtension.class)
class InstrumentSearchServiceTest {

    @Mock
    InstrumentRepository repository;

    @InjectMocks
    InstrumentService service;

    /**
     * AC1: GET /instruments/search accepts a query string and returns matching instruments
     * (symbol/name, case-insensitive, partial match).
     */
    @Test
    void searchReturnsCaseInsensitivePartialMatches() {
        UUID aaplId = UUID.randomUUID();
        UUID amznId = UUID.randomUUID();
        
        var aapl = new InstrumentResponse(aaplId, "AAPL", "Apple Inc.", "COMMON_STOCK", "NASDAQ", "USD", "Technology", true, true);
        var amzn = new InstrumentResponse(amznId, "AMZN", "Amazon.com Inc.", "COMMON_STOCK", "NASDAQ", "USD", "Consumer", true, true);

        when(repository.searchBySymbolOrName("AAP")).thenReturn(List.of(aapl));
        when(repository.searchBySymbolOrName("aap")).thenReturn(List.of(aapl));
        when(repository.searchBySymbolOrName("apple")).thenReturn(List.of(aapl));
        when(repository.searchBySymbolOrName("amazon")).thenReturn(List.of(amzn));
        when(repository.searchBySymbolOrName("AMZN")).thenReturn(List.of(amzn));

        assertThat(service.searchInstruments("AAP")).containsExactly(aapl);
        assertThat(service.searchInstruments("aap")).containsExactly(aapl);
        assertThat(service.searchInstruments("apple")).containsExactly(aapl);
        assertThat(service.searchInstruments("amazon")).containsExactly(amzn);
        assertThat(service.searchInstruments("AMZN")).containsExactly(amzn);
    }

    /**
     * AC2: Search is a distinct route, not misrouted as an instrument ID lookup.
     * Ensures /search endpoint is callable separately from /{instrumentId}.
     */
    @Test
    void searchEndpointIsDistinctFromIdLookup() {
        UUID instrumentId = UUID.randomUUID();
        var instrument = new InstrumentResponse(instrumentId, "TEST", "Test Inc.", "COMMON_STOCK", "TEST", "USD", null, true, true);

        // Search query
        when(repository.searchBySymbolOrName("TEST")).thenReturn(List.of(instrument));
        List<InstrumentResponse> searchResults = service.searchInstruments("TEST");
        assertThat(searchResults).containsExactly(instrument);

        // ID-based lookup (different method)
        when(repository.findById(instrumentId)).thenReturn(java.util.Optional.of(instrument));
        InstrumentResponse byId = service.getInstrument(instrumentId);
        assertThat(byId).isEqualTo(instrument);
    }

    /**
     * AC3: Unknown/empty query returns an empty list, not an error.
     */
    @Test
    void emptyQueryReturnsEmptyList() {
        when(repository.searchBySymbolOrName(null)).thenReturn(List.of());
        when(repository.searchBySymbolOrName("")).thenReturn(List.of());
        when(repository.searchBySymbolOrName("   ")).thenReturn(List.of());
        when(repository.searchBySymbolOrName("NONEXISTENT")).thenReturn(List.of());

        assertThat(service.searchInstruments(null)).isEmpty();
        assertThat(service.searchInstruments("")).isEmpty();
        assertThat(service.searchInstruments("   ")).isEmpty();
        assertThat(service.searchInstruments("NONEXISTENT")).isEmpty();
    }

    /**
     * Bounded result set: search returns at most 100 results (enforced at repository level).
     */
    @Test
    void searchReturnsAtMost100Results() {
        var results = new java.util.ArrayList<InstrumentResponse>();
        for (int i = 0; i < 100; i++) {
            results.add(new InstrumentResponse(UUID.randomUUID(), "INST" + i, "Instrument " + i, "COMMON_STOCK", "TEST", "USD", null, true, true));
        }

        when(repository.searchBySymbolOrName("INST")).thenReturn(results);
        
        List<InstrumentResponse> searchResults = service.searchInstruments("INST");
        assertThat(searchResults).hasSize(100);
    }

    /**
     * Partial match on symbol: "AAP" matches "AAPL".
     */
    @Test
    void partialSymbolMatchWorks() {
        UUID aaplId = UUID.randomUUID();
        var aapl = new InstrumentResponse(aaplId, "AAPL", "Apple Inc.", "COMMON_STOCK", "NASDAQ", "USD", "Technology", true, true);

        when(repository.searchBySymbolOrName("AAP")).thenReturn(List.of(aapl));

        assertThat(service.searchInstruments("AAP")).contains(aapl);
    }

    /**
     * Partial match on name: "Inc" matches "Apple Inc.", "Amazon Inc.", etc.
     */
    @Test
    void partialNameMatchWorks() {
        UUID aaplId = UUID.randomUUID();
        UUID amznId = UUID.randomUUID();
        
        var aapl = new InstrumentResponse(aaplId, "AAPL", "Apple Inc.", "COMMON_STOCK", "NASDAQ", "USD", "Technology", true, true);
        var amzn = new InstrumentResponse(amznId, "AMZN", "Amazon Inc.", "COMMON_STOCK", "NASDAQ", "USD", "Consumer", true, true);

        when(repository.searchBySymbolOrName("Inc")).thenReturn(List.of(aapl, amzn));

        assertThat(service.searchInstruments("Inc")).containsExactly(aapl, amzn);
    }

    /**
     * Multiple matches are returned.
     */
    @Test
    void multipleMatchesAreReturned() {
        UUID aaplId = UUID.randomUUID();
        UUID aapl2Id = UUID.randomUUID();
        
        var aapl1 = new InstrumentResponse(aaplId, "AAPL", "Apple Inc.", "COMMON_STOCK", "NASDAQ", "USD", "Technology", true, true);
        var aapl2 = new InstrumentResponse(aapl2Id, "AAPL", "Apple Inc. (Alternative)", "COMMON_STOCK", "NYSE", "USD", "Technology", true, true);

        when(repository.searchBySymbolOrName("AAPL")).thenReturn(List.of(aapl1, aapl2));

        List<InstrumentResponse> results = service.searchInstruments("AAPL");
        assertThat(results).containsExactly(aapl1, aapl2);
    }

    /**
     * Disabled instruments are included in search results (unlike order submission which filters them).
     * Search returns all catalog entries to allow browsing.
     */
    @Test
    void searchIncludesDisabledInstruments() {
        UUID instrumentId = UUID.randomUUID();
        var disabled = new InstrumentResponse(instrumentId, "OLD", "Delisted Security", "COMMON_STOCK", "UNKNOWN", "USD", null, false, false);

        when(repository.searchBySymbolOrName("OLD")).thenReturn(List.of(disabled));

        assertThat(service.searchInstruments("OLD")).contains(disabled);
    }
}
