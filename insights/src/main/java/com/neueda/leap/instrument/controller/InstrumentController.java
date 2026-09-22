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
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Read-only REST API for the instrument catalog. */
@RestController
@RequestMapping("/instruments")
public class InstrumentController {
    private final InstrumentService service;

    public InstrumentController(InstrumentService service) {
        this.service = service;
    }

    @GetMapping
    public List<InstrumentResponse> getInstruments() {
        return service.getInstruments();
    }

    @GetMapping("/{instrumentId}")
    public InstrumentResponse getInstrument(@PathVariable UUID instrumentId) {
        return service.getInstrument(instrumentId);
    }

    @ExceptionHandler(InstrumentNotFoundException.class)
    public ResponseEntity<Map<String, String>> instrumentNotFound(InstrumentNotFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                "code", "INSTRUMENT_NOT_FOUND",
                "message", exception.getMessage()
        ));
    }
}
