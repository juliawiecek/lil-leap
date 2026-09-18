package com.neueda.leap.marketdata;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.*;
class JdbcQuoteRepositoryTest {
 @Test void preciseInstrumentQueryUsesUuid(){JdbcTemplate jdbc=mock(JdbcTemplate.class); when(jdbc.query(anyString(),any(RowMapper.class),any(UUID.class))).thenReturn(List.of()); assertTrue(new JdbcQuoteRepository(jdbc).findLatestByInstrumentId(UUID.randomUUID()).isEmpty());}
 @Test void marketAndSymbolAreNormalized(){JdbcTemplate jdbc=mock(JdbcTemplate.class); when(jdbc.query(anyString(),any(RowMapper.class),eq("NASDAQ"),eq("AAPL"))).thenReturn(List.of()); new JdbcQuoteRepository(jdbc).findLatestByMarketAndSymbol(" nasdaq "," aapl "); verify(jdbc).query(anyString(),any(RowMapper.class),eq("NASDAQ"),eq("AAPL"));}
}
