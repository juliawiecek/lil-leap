package com.neueda.leap.security;

import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JwtServiceTest {

    private static final String SECRET = "test-only-jwt-secret-at-least-32-bytes-long!!";

    @Test
    void issueToken_thenValidate_shouldReturnOriginalIdentity() {
        JwtService jwtService = new JwtServiceImpl(SECRET, 60, "nexttrade-web");
        UUID userId = UUID.randomUUID();

        String token = jwtService.issueToken(userId, "julia@example.com");
        Optional<JwtPrincipal> principal = jwtService.validate(token);

        assertTrue(principal.isPresent());
        assertEquals(userId, principal.get().userId());
        assertEquals("julia@example.com", principal.get().email());
    }

    @Test
    void validate_shouldRejectTamperedSignature() {
        JwtService jwtService = new JwtServiceImpl(SECRET, 60, "nexttrade-web");
        String token = jwtService.issueToken(UUID.randomUUID(), "julia@example.com");

        String tampered = token.substring(0, token.length() - 1)
                + (token.charAt(token.length() - 1) == 'a' ? 'b' : 'a');

        assertTrue(jwtService.validate(tampered).isEmpty());
    }

    @Test
    void validate_shouldRejectExpiredToken() {
        JwtService expiredIssuer = new JwtServiceImpl(SECRET, -1, "nexttrade-web");
        String token = expiredIssuer.issueToken(UUID.randomUUID(), "julia@example.com");

        JwtService jwtService = new JwtServiceImpl(SECRET, 60, "nexttrade-web");

        assertTrue(jwtService.validate(token).isEmpty());
    }

    @Test
    void validate_shouldRejectMalformedToken() {
        JwtService jwtService = new JwtServiceImpl(SECRET, 60, "nexttrade-web");

        assertTrue(jwtService.validate("not-a-real-token").isEmpty());
    }
}
