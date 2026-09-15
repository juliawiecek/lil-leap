package com.neueda.leap.identity.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

// dtoLoggingIsSafeWithoutChangingWireValues (backend's third test, exercising
// LoginRequest/LoginResponse/RegisterUserRequest) is deferred until auth-service
// has its own equivalent DTOs — see Phase 5 of TS-02.5.
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
}
