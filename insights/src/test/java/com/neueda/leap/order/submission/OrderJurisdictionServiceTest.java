package com.neueda.leap.order.submission;

import com.neueda.leap.order.service.OrderJurisdictionException;
import com.neueda.leap.order.service.OrderJurisdictionService;
import com.neueda.leap.order.service.RegisteredCountry;
import com.neueda.leap.order.submission.repository.OrderJurisdictionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class OrderJurisdictionServiceTest {
    private final UUID user = UUID.randomUUID();
    private final UUID instrument = UUID.randomUUID();
    private OrderJurisdictionRepository repository;
    private OrderJurisdictionService service;

    @BeforeEach
    void setUp() {
        repository = mock(OrderJurisdictionRepository.class);
        service = new OrderJurisdictionService(repository);
    }

    @ParameterizedTest
    @ValueSource(strings = {"US", "us", " USA ", "United States", " united   states ",
            "United States of America", "U.S.", "U.S.A."})
    void registeredCountryAliasesCannotBypassRestriction(String country) {
        when(repository.registeredCountry(user)).thenReturn(Optional.of(country));
        when(repository.isRestricted(instrument, "US")).thenReturn(true);
        assertThatThrownBy(() -> service.validate(user, instrument))
                .isInstanceOfSatisfying(OrderJurisdictionException.class,
                        error -> assertThat(error.reason()).isEqualTo(OrderJurisdictionException.Reason.LOCATION_RESTRICTED));
        verify(repository).registeredCountry(user);
        verify(repository).isRestricted(instrument, "US");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"  ", "Unknown", "ZZ", "US-TX", "US%' OR 1=1--"})
    void missingOrUnrecognizedCountryFailsClosed(String country) {
        when(repository.registeredCountry(user)).thenReturn(Optional.ofNullable(country));
        assertThatThrownBy(() -> service.validate(user, instrument))
                .isInstanceOfSatisfying(OrderJurisdictionException.class,
                        error -> assertThat(error.reason()).isEqualTo(OrderJurisdictionException.Reason.LOCATION_UNAVAILABLE));
        verify(repository, never()).isRestricted(any(), any());
    }

    @Test
    void recognizedCountryWithoutMatchingRuleCanTrade() {
        when(repository.registeredCountry(user)).thenReturn(Optional.of("Canada"));
        when(repository.isRestricted(instrument, "CA")).thenReturn(false);
        assertThatCode(() -> service.validate(user, instrument)).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @CsvSource({"United Kingdom,GB", "UK,GB", "GBR,GB", "Great Britain,GB", "can,CA", "Germany,DE", "IND,IN"})
    void normalizesSupportedCountryNamesAndCodes(String country, String expected) {
        assertThat(RegisteredCountry.code(country)).contains(expected);
    }

    @Test
    void countryMatchingIsIndependentOfMachineLocale() {
        Locale previous = Locale.getDefault();
        try {
            Locale.setDefault(Locale.forLanguageTag("tr-TR"));
            assertThat(RegisteredCountry.code("india")).contains("IN");
        } finally {
            Locale.setDefault(previous);
        }
    }
}
