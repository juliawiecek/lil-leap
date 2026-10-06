package com.neueda.leap.instrument.controller;

import com.neueda.leap.instrument.dto.InstrumentResponse;
import com.neueda.leap.instrument.service.InstrumentService;
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
 * Unit tests for InstrumentController search endpoint (TS-13.5, BR-12, AC1).
 */
@ExtendWith(MockitoExtension.class)
class InstrumentSearchControllerTest {

    @Mock
    InstrumentService service;

    @InjectMocks
    InstrumentController controller;

    /**
     * AC1: GET /instruments/search accepts a query string and returns matching instruments.
     */
    @Test
    void searchEndpointAcceptsQueryAndReturnsMatches() {
        UUID instrumentId = UUID.randomUUID();
        var instrument = new InstrumentResponse(instrumentId, "AAPL", "Apple Inc.", "COMMON_STOCK", "NASDAQ", "USD", "Technology", true, true);

        when(service.searchInstruments("AAP")).thenReturn(List.of(instrument));

        List<InstrumentResponse> result = controller.searchInstruments("AAP");

        assertThat(result).containsExactly(instrument);
    }

    /**
     * AC3: Empty query returns an empty list, not an error.
     */
    @Test
    void emptyQueryReturnsEmptyList() {
        when(service.searchInstruments(null)).thenReturn(List.of());
        when(service.searchInstruments("")).thenReturn(List.of());

        assertThat(controller.searchInstruments(null)).isEmpty();
        assertThat(controller.searchInstruments("")).isEmpty();
    }

    /**
     * No matches found returns empty list.
     */
    @Test
    void noMatchesReturnsEmptyList() {
        when(service.searchInstruments("ZZZZ")).thenReturn(List.of());

        List<InstrumentResponse> result = controller.searchInstruments("ZZZZ");

        assertThat(result).isEmpty();
    }

    /**
     * Multiple matches are returned in order.
     */
    @Test
    void multipleMatchesAreReturned() {
        UUID id1 = UUID.randomUUID();
        UUID id2 = UUID.randomUUID();
        
        var inst1 = new InstrumentResponse(id1, "AAPL", "Apple", "COMMON_STOCK", "NASDAQ", "USD", null, true, true);
        var inst2 = new InstrumentResponse(id2, "AMZN", "Amazon", "COMMON_STOCK", "NASDAQ", "USD", null, true, true);

        when(service.searchInstruments("A")).thenReturn(List.of(inst1, inst2));

        List<InstrumentResponse> result = controller.searchInstruments("A");

        assertThat(result).containsExactly(inst1, inst2);
    }

    /**
     * Search endpoint returns InstrumentResponse objects with all required fields.
     */
    @Test
    void responseContainsAllInstrumentFields() {
        UUID instrumentId = UUID.randomUUID();
        var instrument = new InstrumentResponse(
                instrumentId, "AAPL", "Apple Inc.", "COMMON_STOCK", 
                "NASDAQ", "USD", "Technology", true, true
        );

        when(service.searchInstruments("AAPL")).thenReturn(List.of(instrument));

        List<InstrumentResponse> result = controller.searchInstruments("AAPL");

        assertThat(result).hasSize(1);
        InstrumentResponse returned = result.get(0);
        assertThat(returned.instrumentId()).isEqualTo(instrumentId);
        assertThat(returned.symbol()).isEqualTo("AAPL");
        assertThat(returned.instrumentName()).isEqualTo("Apple Inc.");
        assertThat(returned.assetClass()).isEqualTo("COMMON_STOCK");
        assertThat(returned.marketCode()).isEqualTo("NASDAQ");
        assertThat(returned.currency()).isEqualTo("USD");
        assertThat(returned.sector()).isEqualTo("Technology");
        assertThat(returned.enabled()).isTrue();
        assertThat(returned.tradable()).isTrue();
    }
}
