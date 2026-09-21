package com.neueda.leap.instrument.controller;

import com.neueda.leap.instrument.dto.InstrumentResponse;
import com.neueda.leap.instrument.service.InstrumentNotFoundException;
import com.neueda.leap.instrument.service.InstrumentService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class InstrumentControllerTest {
    private InstrumentService service;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        service = mock(InstrumentService.class);
        mockMvc = standaloneSetup(new InstrumentController(service)).build();
    }

    @Test
    void listsInstruments() throws Exception {
        UUID id = UUID.randomUUID();
        when(service.getInstruments()).thenReturn(List.of(instrument(id)));

        mockMvc.perform(get("/instruments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].instrumentId").value(id.toString()))
                .andExpect(jsonPath("$[0].symbol").value("AAPL"))
                .andExpect(jsonPath("$[0].tradable").value(true));
    }

    @Test
    void getsInstrumentById() throws Exception {
        UUID id = UUID.randomUUID();
        when(service.getInstrument(id)).thenReturn(instrument(id));

        mockMvc.perform(get("/instruments/{instrumentId}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.instrumentId").value(id.toString()))
                .andExpect(jsonPath("$.marketCode").value("NASDAQ"));
    }

    @Test
    void unknownInstrumentReturnsControlled404() throws Exception {
        UUID id = UUID.randomUUID();
        when(service.getInstrument(id)).thenThrow(new InstrumentNotFoundException(id));

        mockMvc.perform(get("/instruments/{instrumentId}", id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("INSTRUMENT_NOT_FOUND"));
    }

    private static InstrumentResponse instrument(UUID id) {
        return new InstrumentResponse(id, "AAPL", "Apple Inc.", "COMMON_STOCK",
                "NASDAQ", "USD", "Technology", true, true);
    }
}
