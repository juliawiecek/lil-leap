package com.neueda.leap.instrument.repository;

import com.neueda.leap.instrument.dto.InstrumentResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class JdbcInstrumentRepositoryTest {
    private final UUID apple = UUID.randomUUID();
    private final UUID appleLondon = UUID.randomUUID();
    private final UUID microsoft = UUID.randomUUID();
    private final UUID euro = UUID.randomUUID();
    private JdbcInstrumentRepository repository;

    @BeforeEach
    void setUp() {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:instruments-" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("""
                CREATE TABLE instruments(instrument_id UUID PRIMARY KEY, symbol VARCHAR(20) NOT NULL,
                    instrument_name VARCHAR(200) NOT NULL, asset_class VARCHAR(30) NOT NULL,
                    market_code VARCHAR(20) NOT NULL, currency CHAR(3) NOT NULL, sector VARCHAR(100),
                    enabled BOOLEAN NOT NULL, tradable BOOLEAN NOT NULL)
                """);
        String insert = "INSERT INTO instruments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
        jdbc.update(insert, microsoft, "MSFT", "Microsoft Corporation", "COMMON_STOCK", "NASDAQ", "USD", "Technology", true, true);
        jdbc.update(insert, apple, "AAPL", "Apple Inc.", "COMMON_STOCK", "NASDAQ", "USD", "Technology", true, true);
        jdbc.update(insert, appleLondon, "AAPL", "Apple Inc. (London)", "COMMON_STOCK", "LSE", "GBP", null, false, false);
        jdbc.update(insert, euro, "EURUSD", "Euro / US Dollar", "FX", "FX", "USD", null, true, true);
        repository = new JdbcInstrumentRepository(jdbc);
    }

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

    @Test
    void findAllListsEveryInstrumentByMarketThenSymbol() {
        assertThat(repository.findAll()).extracting(InstrumentResponse::instrumentId)
                .containsExactly(euro, appleLondon, apple, microsoft);
    }

    @Test
    void findByIdMapsEveryColumnIncludingNullSectorAndDisabledFlags() {
        assertThat(repository.findById(appleLondon)).contains(new InstrumentResponse(appleLondon, "AAPL",
                "Apple Inc. (London)", "COMMON_STOCK", "LSE", "GBP", null, false, false));
        assertThat(repository.findById(apple).orElseThrow().currency()).isEqualTo("USD");
        assertThat(repository.findById(UUID.randomUUID())).isEmpty();
    }

    @Test
    void findBySymbolPicksTheFirstMarketAlphabeticallyForADuplicatedSymbol() {
        assertThat(repository.findBySymbol("AAPL").map(InstrumentResponse::marketCode)).contains("LSE");
        assertThat(repository.findBySymbol("MSFT").map(InstrumentResponse::instrumentId)).contains(microsoft);
        assertThat(repository.findBySymbol("NOPE")).isEmpty();
    }

    @Test
    void searchMatchesSymbolOrNameIgnoringCaseAndSurroundingSpaces() {
        assertThat(repository.searchBySymbolOrName("  aap ")).extracting(InstrumentResponse::instrumentId)
                .containsExactly(appleLondon, apple);
        assertThat(repository.searchBySymbolOrName("microsoft")).extracting(InstrumentResponse::symbol)
                .containsExactly("MSFT");
        assertThat(repository.searchBySymbolOrName("dollar")).extracting(InstrumentResponse::symbol)
                .containsExactly("EURUSD");
        assertThat(repository.searchBySymbolOrName("zzz")).isEmpty();
    }

    @Test
    void blankOrMissingSearchReturnsNothingWithoutQuerying() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var unqueried = new JdbcInstrumentRepository(jdbc);

        assertThat(unqueried.searchBySymbolOrName(null)).isEmpty();
        assertThat(unqueried.searchBySymbolOrName("")).isEmpty();
        assertThat(unqueried.searchBySymbolOrName("   ")).isEmpty();
        verifyNoInteractions(jdbc);
    }

    private static InstrumentResponse instrument(UUID id) {
        return new InstrumentResponse(id, "AAPL", "Apple Inc.", "COMMON_STOCK",
                "NASDAQ", "USD", "Technology", true, true);
    }
}
