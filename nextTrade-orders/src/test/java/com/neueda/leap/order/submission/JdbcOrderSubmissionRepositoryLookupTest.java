package com.neueda.leap.order.submission;

import com.neueda.leap.order.submission.dto.OrderSubmissionResponse;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.JdbcOrderSubmissionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Ownership, country and idempotency lookups against an in-memory database, and the mapping of the
 * PostgreSQL-only insert statement through its row mapper.
 */
class JdbcOrderSubmissionRepositoryLookupTest {
    private JdbcTemplate jdbc;
    private JdbcOrderSubmissionRepository repository;
    private final UUID userId = UUID.randomUUID();
    private final UUID accountId = UUID.randomUUID();
    private final UUID instrumentId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        var dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:submission-" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        new ResourceDatabasePopulator(new ClassPathResource("order/submission-schema.sql")).execute(dataSource);
        jdbc = new JdbcTemplate(dataSource);
        repository = new JdbcOrderSubmissionRepository(jdbc);
        jdbc.update("INSERT INTO accounts(account_id, user_id, account_status, trading_enabled) VALUES (?, ?, 'ACTIVE', TRUE)",
                accountId, userId);
        jdbc.update("INSERT INTO instruments(instrument_id, symbol, market_code, enabled, tradable) "
                + "VALUES (?, 'AAPL', 'NASDAQ', TRUE, TRUE)", instrumentId);
    }

    @Test
    void accountBelongsOnlyToItsOwner() {
        assertThat(repository.accountBelongsToUser(accountId, userId)).isTrue();
        assertThat(repository.accountBelongsToUser(accountId, UUID.randomUUID())).isFalse();
        assertThat(repository.accountBelongsToUser(UUID.randomUUID(), userId)).isFalse();
    }

    @Test
    void ownershipCountThatIsMissingIsTreatedAsNotOwned() {
        JdbcTemplate mocked = mock(JdbcTemplate.class);
        when(mocked.queryForObject(anyString(), eq(Integer.class), eq(accountId), eq(userId))).thenReturn(null);

        assertThat(new JdbcOrderSubmissionRepository(mocked).accountBelongsToUser(accountId, userId)).isFalse();
    }

    @Test
    void clientCountryComesFromTheAccountOwnersProfile() {
        assertThat(repository.findClientCountry(accountId)).isEmpty();

        jdbc.update("INSERT INTO customer_profiles(user_id, country) VALUES (?, NULL)", userId);
        assertThat(repository.findClientCountry(accountId)).isEmpty();

        jdbc.update("UPDATE customer_profiles SET country = 'Ireland' WHERE user_id = ?", userId);
        assertThat(repository.findClientCountry(accountId)).contains("Ireland");
        assertThat(repository.findClientCountry(UUID.randomUUID())).isEmpty();
    }

    @Test
    void existingOrderIsFoundByAccountAndClientReferenceWithItsSymbol() {
        UUID orderId = UUID.randomUUID();
        UUID reference = UUID.randomUUID();
        Instant submitted = Instant.parse("2026-10-01T14:30:00Z");
        jdbc.update("""
                INSERT INTO orders(order_id, account_id, instrument_id, client_reference, side, quantity, order_type,
                                   status, submitted_at, buffer_percent)
                VALUES (?, ?, ?, ?, 'SELL', 7, 'MARKET', 'ACCEPTED', ?, 2.50)
                """, orderId, accountId, instrumentId, reference, Timestamp.from(submitted));

        OrderSubmissionResponse found = repository.findByAccountAndClientReference(accountId, reference).orElseThrow();

        assertThat(found.orderId()).isEqualTo(orderId);
        assertThat(found.accountId()).isEqualTo(accountId);
        assertThat(found.instrumentId()).isEqualTo(instrumentId);
        assertThat(found.symbol()).isEqualTo("AAPL");
        assertThat(found.clientReference()).isEqualTo(reference);
        assertThat(found.side()).isEqualTo("SELL");
        assertThat(found.quantity()).isEqualTo(7);
        assertThat(found.orderType()).isEqualTo("MARKET");
        assertThat(found.status()).isEqualTo("ACCEPTED");
        assertThat(found.submittedAt()).isEqualTo(submitted);
        assertThat(found.bufferPercent()).isEqualByComparingTo("2.50");
        assertThat(repository.findByAccountAndClientReference(accountId, UUID.randomUUID())).isEmpty();
        assertThat(repository.findByAccountAndClientReference(UUID.randomUUID(), reference)).isEmpty();
    }

    @Test
    @SuppressWarnings("unchecked")
    void insertBindsTheNormalisedRequestAndMapsTheReturnedRowWithTheResolvedSymbol() throws Exception {
        JdbcTemplate mocked = mock(JdbcTemplate.class);
        UUID reference = UUID.randomUUID();
        var request = new SubmitOrderRequest(accountId, "aapl", reference, " buy ", 5, null, new BigDecimal("1.50"));
        when(mocked.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());

        assertThat(new JdbcOrderSubmissionRepository(mocked)
                .insert(request, instrumentId, "AAPL", new BigDecimal("187.25"))).isEmpty();

        ArgumentCaptor<RowMapper<OrderSubmissionResponse>> mapper = ArgumentCaptor.forClass(RowMapper.class);
        verify(mocked).query(contains("ON CONFLICT (account_id, client_reference) DO NOTHING"), mapper.capture(),
                eq(accountId), eq(instrumentId), eq(reference), eq("BUY"), eq(5L), eq("MARKET"),
                eq(new BigDecimal("1.50")), eq(new BigDecimal("187.25")));

        UUID orderId = UUID.randomUUID();
        Instant submitted = Instant.parse("2026-10-01T14:30:00Z");
        ResultSet rs = mock(ResultSet.class);
        when(rs.getObject("order_id", UUID.class)).thenReturn(orderId);
        when(rs.getObject("account_id", UUID.class)).thenReturn(accountId);
        when(rs.getObject("instrument_id", UUID.class)).thenReturn(instrumentId);
        when(rs.getObject("client_reference", UUID.class)).thenReturn(reference);
        when(rs.getString("side")).thenReturn("BUY");
        when(rs.getLong("quantity")).thenReturn(5L);
        when(rs.getString("order_type")).thenReturn("MARKET");
        when(rs.getString("status")).thenReturn("SUBMITTED");
        when(rs.getTimestamp("submitted_at")).thenReturn(Timestamp.from(submitted));
        when(rs.getBigDecimal("buffer_percent")).thenReturn(new BigDecimal("1.50"));

        assertThat(mapper.getValue().mapRow(rs, 0)).isEqualTo(new OrderSubmissionResponse(orderId, accountId,
                instrumentId, "AAPL", reference, "BUY", 5L, "MARKET", "SUBMITTED", submitted, new BigDecimal("1.50")));
    }
}
