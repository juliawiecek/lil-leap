package com.neueda.leap.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.neueda.leap.onboarding.dto.RegisterUserRequest;
import com.neueda.leap.user.dto.LoginRequest;
import com.neueda.leap.user.dto.LoginResponse;
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

    @Test
    void dtoLoggingIsSafeWithoutChangingWireValues() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        LoginRequest login = new LoginRequest("email-canary", "password-canary");
        LoginResponse response = new LoginResponse("token-canary", null);
        RegisterUserRequest registration = mapper.readValue(
                "{\"password\":\"password-canary\",\"ssn\":\"ssn-canary\",\"email\":\"email-canary\"}", RegisterUserRequest.class);
        assertThat(login.toString() + response + registration).doesNotContain("canary");
        assertThat(mapper.readTree(mapper.writeValueAsString(response)).get("token").asText()).isEqualTo("token-canary");
        assertThat(login.password()).isEqualTo("password-canary");
        assertThat(registration.password()).isEqualTo("password-canary");
    }
}
