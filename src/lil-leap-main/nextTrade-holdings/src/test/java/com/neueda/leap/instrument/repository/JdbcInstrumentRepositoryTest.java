package com.neueda.leap.instrument.repository;

import com.neueda.leap.instrument.dto.InstrumentResponse;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JdbcInstrumentRepositoryTest {
    @Test
    void findAllDelegatesToJdbcTemplate() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        InstrumentResponse expected = instrument(UUID.randomUUID());
        when(jdbc.query(anyString(), any(RowMapper.class))).thenReturn(List.of(expected));

        assertEquals(List.of(expected), new JdbcInstrumentRepository(jdbc).findAll());
    }

    @Test
    void findByIdReturnsEmptyWhenNoRowExists() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(anyString(), any(RowMapper.class), any(UUID.class))).thenReturn(List.of());

        assertTrue(new JdbcInstrumentRepository(jdbc).findById(UUID.randomUUID()).isEmpty());
    }

    private static InstrumentResponse instrument(UUID id) {
        return new InstrumentResponse(id, "AAPL", "Apple Inc.", "COMMON_STOCK",
                "NASDAQ", "USD", "Technology", true, true);
    }
}
