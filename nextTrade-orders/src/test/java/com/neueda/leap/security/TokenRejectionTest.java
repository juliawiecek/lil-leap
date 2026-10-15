package com.neueda.leap.security;

import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;
import java.util.function.UnaryOperator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * TS-SEC-01: token verification fails closed. Malformed, forged, expired or incomplete tokens are
 * rejected with 401, and an unexpected error while verifying denies access instead of granting it.
 */
class TokenRejectionTest {

    private static final String SECRET = "test-only-jwt-secret-at-least-32-bytes-long!!";
    private static final SecretKey KEY = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
    private static final Base64.Encoder URL = Base64.getUrlEncoder().withoutPadding();

    private final JwtServiceImpl jwt = new JwtServiceImpl(SECRET, 60, "nexttrade-web");

    @BeforeEach
    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void aWellFormedTokenIsAcceptedSoTheRejectionsBelowAreMeaningful() {
        assertThat(jwt.validate(token(b -> b))).isPresent();
    }

    @Test
    void aTokenSignedWithAnotherKeyIsRejected() {
        SecretKey other = Keys.hmacShaKeyFor("another-secret-that-is-at-least-32-bytes!".getBytes(StandardCharsets.UTF_8));
        String forged = Jwts.builder().subject(UUID.randomUUID().toString()).expiration(in(60)).signWith(other).compact();
        assertThat(jwt.validate(forged)).isEmpty();
    }

    @Test
    void anUnsignedAlgNoneTokenIsRejected() {
        String header = encode("{\"alg\":\"none\",\"typ\":\"JWT\"}");
        String payload = encode("{\"sub\":\"" + UUID.randomUUID() + "\",\"user_role\":\"TRADER\",\"exp\":"
                + Instant.now().plusSeconds(600).getEpochSecond() + "}");
        assertThat(jwt.validate(header + "." + payload + ".")).isEmpty();
    }

    @Test
    void anExpiredTokenIsRejectedEvenWhenOtherwiseValid() {
        assertThat(jwt.validate(token(b -> b.expiration(in(-1))))).isEmpty();
    }

    @Test
    void aTokenWithoutAnExpiryIsRejectedBecauseItWouldNeverExpire() {
        assertThat(jwt.validate(token(b -> b.expiration(null)))).isEmpty();
    }

    @Test
    void aTokenNotYetValidIsRejected() {
        assertThat(jwt.validate(token(b -> b.notBefore(in(10))))).isEmpty();
    }

    @Test
    void aTokenWithoutASubjectIsRejected() {
        assertThat(jwt.validate(token(b -> b.subject(null)))).isEmpty();
    }

    @Test
    void aTokenWhoseSubjectIsNotAUserIdIsRejected() {
        assertThat(jwt.validate(token(b -> b.subject("admin")))).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "abc", "a.b", "a.b.c", "a.b.c.d", "e30.e30.", "%%%.%%%.%%%"})
    void tokensInTheWrongFormatAreRejected(String malformed) {
        assertThat(jwt.validate(malformed)).isEmpty();
    }

    @Test
    void anExpiredTokenGetsA401AndNeverReachesTheEndpoint() throws Exception {
        assertRejectedByFilter(new JwtAuthenticationFilter(jwt), token(b -> b.expiration(in(-1))));
    }

    @Test
    void aValidatorThatThrowsUnexpectedlyDeniesAccessWithA401() throws Exception {
        JwtService broken = mock(JwtService.class);
        when(broken.validate(anyString())).thenThrow(new IllegalStateException("verification bug"));
        assertRejectedByFilter(new JwtAuthenticationFilter(broken), token(b -> b));
    }

    private static void assertRejectedByFilter(JwtAuthenticationFilter filter, String token) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + token);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verifyNoInteractions(chain);
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).contains("INVALID_TOKEN");
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    /** A correctly signed token, adjusted by the given change. */
    private static String token(UnaryOperator<JwtBuilder> change) {
        JwtBuilder builder = Jwts.builder()
                .subject(UUID.randomUUID().toString())
                .claim("email", "client@example.test")
                .claim("user_role", "TRADER")
                .issuedAt(in(0))
                .expiration(in(60));
        return change.apply(builder).signWith(KEY).compact();
    }

    @SuppressWarnings("java:S2143") // JJWT's temporal claims take java.util.Date.
    private static Date in(long minutes) {
        return Date.from(Instant.now().plusSeconds(minutes * 60));
    }

    private static String encode(String json) {
        return URL.encodeToString(json.getBytes(StandardCharsets.UTF_8));
    }
}
