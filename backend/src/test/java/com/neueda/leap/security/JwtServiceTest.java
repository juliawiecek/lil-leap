package com.neueda.leap.security;

import org.junit.jupiter.api.Test;

import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JwtServiceTest {

    private static final String SECRET = "test-only-jwt-secret-at-least-32-bytes-long!!";

    @Test
    void issueToken_thenValidate_shouldReturnOriginalIdentity() {
        JwtService jwtService = new JwtService(SECRET, 60, "nexttrade-web");
        UUID userId = UUID.randomUUID();

        String token = jwtService.issueToken(userId, "julia@example.com");
        Optional<JwtPrincipal> principal = jwtService.validate(token);

        assertTrue(principal.isPresent());
        assertEquals(userId, principal.get().userId());
        assertEquals("julia@example.com", principal.get().email());
    }

    @Test
    void validate_shouldRejectTamperedSignature() {
        JwtService jwtService = new JwtService(SECRET, 60, "nexttrade-web");
        String token = jwtService.issueToken(UUID.randomUUID(), "julia@example.com");

        int signatureStart = token.lastIndexOf('.') + 1;
        byte[] signature = Base64.getUrlDecoder().decode(token.substring(signatureStart));
        // Change an actual signature bit, avoiding unused bits in the final Base64 character.
        signature[0] ^= 1;
        String tampered = token.substring(0, signatureStart)
                + Base64.getUrlEncoder().withoutPadding().encodeToString(signature);

        assertTrue(jwtService.validate(tampered).isEmpty());
    }

    @Test
    void validate_shouldRejectExpiredToken() {
        JwtService expiredIssuer = new JwtService(SECRET, -1, "nexttrade-web");
        String token = expiredIssuer.issueToken(UUID.randomUUID(), "julia@example.com");

        JwtService jwtService = new JwtService(SECRET, 60, "nexttrade-web");

        assertTrue(jwtService.validate(token).isEmpty());
    }

    @Test
    void validate_shouldRejectMalformedToken() {
        JwtService jwtService = new JwtService(SECRET, 60, "nexttrade-web");

        assertTrue(jwtService.validate("not-a-real-token").isEmpty());
    }
}
