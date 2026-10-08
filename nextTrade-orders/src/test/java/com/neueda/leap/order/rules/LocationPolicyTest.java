package com.neueda.leap.order.rules;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class LocationPolicyTest {

    @ParameterizedTest
    @CsvSource({"US,NASDAQ", "' us ',nyse", "USA,NASDAQ", "U.S.,NASDAQ", "United States,NYSE_ARCA",
            "united  states of america,IEX"})
    void usClientMayTradeUsListedInstruments(String country, String market) {
        assertThat(LocationPolicy.permits(country, market)).isTrue();
    }

    @ParameterizedTest
    @CsvSource(value = {"CA,NASDAQ", "United Kingdom,NYSE", "'',NASDAQ", "NULL,NASDAQ",
            "US,LSE", "US,FX", "US,CRYPTO", "US,NULL", "US,''"}, nullValues = "NULL")
    void otherCountriesMissingCountryAndNonUsMarketsAreRestricted(String country, String market) {
        assertThat(LocationPolicy.permits(country, market)).isFalse();
    }
}
