package com.neueda.leap.order.submission;

import com.neueda.leap.order.service.OrderJurisdictionException;
import com.neueda.leap.order.service.OrderJurisdictionService;
import com.neueda.leap.order.submission.repository.JdbcOrderJurisdictionRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

/** Runs the production rule service and JDBC queries against real table data. */
class JdbcOrderJurisdictionRepositoryTest {
    private final UUID user = UUID.randomUUID();
    private final UUID otherUser = UUID.randomUUID();
    private final UUID instrument = UUID.randomUUID();
    private final UUID otherInstrument = UUID.randomUUID();
    private JdbcTemplate jdbc;
    private JdbcOrderJurisdictionRepository repository;
    private OrderJurisdictionService service;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE customer_profiles(user_id UUID PRIMARY KEY, country VARCHAR(100))");
        jdbc.execute("CREATE TABLE instrument_jurisdiction_restrictions(instrument_id UUID, country_code VARCHAR(2), enabled BOOLEAN NOT NULL, PRIMARY KEY(instrument_id, country_code))");
        jdbc.update("INSERT INTO customer_profiles VALUES (?, 'United States'), (?, 'Canada')", user, otherUser);
        repository = new JdbcOrderJurisdictionRepository(jdbc);
        service = new OrderJurisdictionService(repository);
    }

    @AfterEach
    void closeDatabase() {
        jdbc.execute("SHUTDOWN");
    }

    @Test
    void locationIsReadOnlyFromTheRequestedRegistrationProfile() {
        assertThat(repository.registeredCountry(user)).contains("United States");
        assertThat(repository.registeredCountry(otherUser)).contains("Canada");
        assertThat(repository.registeredCountry(UUID.randomUUID())).isEmpty();
        jdbc.update("UPDATE customer_profiles SET country = NULL WHERE user_id = ?", user);
        assertThat(repository.registeredCountry(user)).isEmpty();
        assertThatThrownBy(() -> service.validate(user, instrument)).isInstanceOf(OrderJurisdictionException.class);
    }

    @Test
    void restrictionsAreScopedToInstrumentAndRegisteredCountry() {
        jdbc.update("INSERT INTO instrument_jurisdiction_restrictions VALUES (?, 'US', TRUE)", instrument);
        assertThatThrownBy(() -> service.validate(user, instrument)).isInstanceOf(OrderJurisdictionException.class);
        assertThatCode(() -> service.validate(otherUser, instrument)).doesNotThrowAnyException();
        assertThatCode(() -> service.validate(user, otherInstrument)).doesNotThrowAnyException();
    }

    @Test
    void ruleMaintenanceTakesEffectWithoutRestart() {
        assertThatCode(() -> service.validate(user, instrument)).doesNotThrowAnyException();
        jdbc.update("INSERT INTO instrument_jurisdiction_restrictions VALUES (?, 'US', TRUE)", instrument);
        assertThatThrownBy(() -> service.validate(user, instrument)).isInstanceOf(OrderJurisdictionException.class);
        jdbc.update("UPDATE instrument_jurisdiction_restrictions SET enabled = FALSE WHERE instrument_id = ?", instrument);
        assertThatCode(() -> service.validate(user, instrument)).doesNotThrowAnyException();
        jdbc.update("UPDATE instrument_jurisdiction_restrictions SET enabled = TRUE WHERE instrument_id = ?", instrument);
        assertThatThrownBy(() -> service.validate(user, instrument)).isInstanceOf(OrderJurisdictionException.class);
        jdbc.update("DELETE FROM instrument_jurisdiction_restrictions WHERE instrument_id = ?", instrument);
        assertThatCode(() -> service.validate(user, instrument)).doesNotThrowAnyException();
    }
}
