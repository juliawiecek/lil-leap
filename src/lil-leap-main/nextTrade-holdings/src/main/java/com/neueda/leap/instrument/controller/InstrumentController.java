package com.neueda.leap.instrument.controller;

import com.neueda.leap.instrument.dto.InstrumentResponse;
import com.neueda.leap.instrument.service.InstrumentNotFoundException;
import com.neueda.leap.instrument.service.InstrumentService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Read-only REST API for the instrument catalog. */
@RestController
@RequestMapping("/instruments")
public class InstrumentController {
    private final InstrumentService service;

    /**
     * Creates a {@code InstrumentController} with the supplied dependencies.
     *
     * @param service instrument query service
     */
    public InstrumentController(InstrumentService service) {
        this.service = service;
    }

    /**
     * Lists the instrument catalog, including disabled and nontradable entries.
     *
     * @return instruments ordered by market code and symbol
     */
    @GetMapping
    public List<InstrumentResponse> getInstruments() {
        return service.getInstruments();
    }

    /**
     * Retrieves one instrument by its persistent identifier.
     *
     * @param instrumentId persistent instrument identifier
     * @return matching instrument
     * @throws InstrumentNotFoundException if the identifier does not exist
     */
    @GetMapping("/{instrumentId}")
    public InstrumentResponse getInstrument(@PathVariable UUID instrumentId) {
        return service.getInstrument(instrumentId);
    }

    /**
     * Searches for instruments by partial symbol or name match (AC1, AC3).
     * Case-insensitive, supports partial matching. Empty query returns empty list.
     * Bounded to 100 results to avoid overwhelming the client.
     *
     * @param query search query string (symbol or name, optional)
     * @return matching instruments ordered by symbol, or empty list if no matches
     */
    @GetMapping("/search")
    public List<InstrumentResponse> searchInstruments(
            @RequestParam(required = false) String query) {
        return service.searchInstruments(query);
    }

    /**
     * Maps a missing instrument to an HTTP 404 response.
     *
     * @param exception exception
     * @return response containing INSTRUMENT_NOT_FOUND and the exception message
     */
    @ExceptionHandler(InstrumentNotFoundException.class)
    public ResponseEntity<Map<String, String>> instrumentNotFound(InstrumentNotFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                "code", "INSTRUMENT_NOT_FOUND",
                "message", exception.getMessage()
        ));
    }
}
