package com.neueda.leap.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class SensitiveLogConverterTest {
    private final SensitiveLogConverter converter = new SensitiveLogConverter();

    @ParameterizedTest
    @ValueSource(strings = {
            "password=canary", "password=canary with spaces, commas & punctuation", "PASSWORD: canary", "{\"password\":\"canary with spaces\\\" and escapes\"}",
            "password_hash=canary", "access_token=canary&action=read", "refreshToken='canary with spaces'",
            "token=canary", "ssn=canary", "client_secret=canary", "Bearer canary", "Basic canary",
            "Authorization: Bearer canary", "Cookie: session=canary; other=canary",
            "{\"authorization\":\"Bearer canary\",\"cookie\":\"canary\"}", "Set-Cookie: session=canary; Secure"
    })
    void masksCredentials(String input) {
        assertThat(converter.transform(null, input)).contains("[REDACTED]").doesNotContain("canary");
    }

    @Test
    void keepsUsefulNonSensitiveEvents() {
        assertThat(converter.transform(null, "Login failed status=401 requestId=123"))
                .isEqualTo("Login failed status=401 requestId=123");
    }


    @ParameterizedTest
    @ValueSource(strings = {"\"", "'"})
    void masksLongEscapedValuesWithoutLosingFollowingFields(String quote) {
        String secret = ("value\\" + quote).repeat(20_000);
        String input = "password=" + quote + secret + quote + ",status=ok";
        assertThat(converter.transform(null, input)).isEqualTo("password=[REDACTED],status=ok");
    }

    @Test
    void masksMultipleQuotedFieldsAndUnterminatedValues() {
        assertThat(converter.transform(null, "password=\"first\",token='second',status=ok"))
                .isEqualTo("password=[REDACTED],token=[REDACTED],status=ok");
        assertThat(converter.transform(null, "password=\"" + "x".repeat(100_000)))
                .isEqualTo("password=[REDACTED]");
    }

    @ParameterizedTest
    @ValueSource(strings = {"password=", "password=,status=ok", "password=&status=ok"})
    void emptyValuesKeepFollowingDiagnostics(String input) {
        assertThat(converter.transform(null, input)).isEqualTo(input);
    }

    @ParameterizedTest
    @ValueSource(strings = {"\n", "\r"})
    void quotedAndUnquotedSecretsStopAtLineBoundary(String newline) {
        assertThat(converter.transform(null, "password=\"canary" + newline + "status=ok"))
                .isEqualTo("password=[REDACTED]" + newline + "status=ok");
        assertThat(converter.transform(null, "token=canary" + newline + "status=ok"))
                .isEqualTo("token=[REDACTED]" + newline + "status=ok");
    }

    @Test
    void trailingEscapeAndEmptyQuotedSecretAreMasked() {
        assertThat(converter.transform(null, "password=\"canary\\"))
                .isEqualTo("password=[REDACTED]");
        assertThat(converter.transform(null, "token=''&status=ok"))
                .isEqualTo("token=[REDACTED]&status=ok");
    }
}
