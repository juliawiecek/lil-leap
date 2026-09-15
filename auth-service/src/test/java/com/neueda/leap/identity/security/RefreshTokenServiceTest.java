package com.neueda.leap.identity.security;

import com.neueda.leap.identity.security.entity.Session;
import com.neueda.leap.identity.security.repository.SessionRepository;
import com.neueda.leap.identity.user.entity.User;
import com.neueda.leap.identity.user.exception.InvalidRefreshTokenException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RefreshTokenServiceTest {

    @Mock
    private SessionRepository sessionRepository;

    private RefreshTokenService refreshTokenService;

    @BeforeEach
    void setUp() {
        refreshTokenService = new RefreshTokenServiceImpl(sessionRepository, 30);
    }

    private User user(UUID id) {
        User user = new User();
        user.setUserId(id);
        user.setEmail("julia@example.com");
        return user;
    }

    @Test
    void issue_shouldPersistHashedTokenNotRawToken() {
        User user = user(UUID.randomUUID());
        when(sessionRepository.save(any(Session.class))).thenAnswer(invocation -> invocation.getArgument(0));

        String rawToken = refreshTokenService.issue(user);

        ArgumentCaptor<Session> captor = ArgumentCaptor.forClass(Session.class);
        verify(sessionRepository).save(captor.capture());

        assertNotNull(rawToken);
        assertEquals(user, captor.getValue().getUser());
        assertNotEquals(rawToken, captor.getValue().getTokenHash());
        assertNotNull(captor.getValue().getExpiresAt());
    }

    @Test
    void rotate_withActiveSession_shouldRevokeOldAndIssueNew() {
        User user = user(UUID.randomUUID());
        when(sessionRepository.save(any(Session.class))).thenAnswer(invocation -> invocation.getArgument(0));

        String rawToken = refreshTokenService.issue(user);
        ArgumentCaptor<Session> issueCaptor = ArgumentCaptor.forClass(Session.class);
        verify(sessionRepository).save(issueCaptor.capture());
        Session issuedSession = issueCaptor.getValue();
        issuedSession.setExpiresAt(OffsetDateTime.now().plusDays(1));

        when(sessionRepository.findByTokenHash(issuedSession.getTokenHash()))
                .thenReturn(Optional.of(issuedSession));

        RefreshTokenService.RotationResult result = refreshTokenService.rotate(rawToken);

        assertEquals(user, result.user());
        assertNotEquals(rawToken, result.newRawRefreshToken());
        assertNotNull(issuedSession.getRevokedAt());
    }

    @Test
    void rotate_withUnknownToken_shouldThrow() {
        when(sessionRepository.findByTokenHash(any())).thenReturn(Optional.empty());

        assertThrows(InvalidRefreshTokenException.class, () -> refreshTokenService.rotate("not-a-real-token"));
    }

    @Test
    void rotate_withExpiredSession_shouldThrow() {
        Session expired = new Session();
        expired.setUser(user(UUID.randomUUID()));
        expired.setTokenHash("some-hash");
        expired.setExpiresAt(OffsetDateTime.now().minusDays(1));

        when(sessionRepository.findByTokenHash(any())).thenReturn(Optional.of(expired));

        assertThrows(InvalidRefreshTokenException.class, () -> refreshTokenService.rotate("expired-token"));
    }

    @Test
    void rotate_withAlreadyRevokedSession_shouldRejectReuse() {
        Session revoked = new Session();
        revoked.setUser(user(UUID.randomUUID()));
        revoked.setTokenHash("some-hash");
        revoked.setExpiresAt(OffsetDateTime.now().plusDays(1));
        revoked.setRevokedAt(OffsetDateTime.now().minusMinutes(1));

        when(sessionRepository.findByTokenHash(any())).thenReturn(Optional.of(revoked));

        assertThrows(InvalidRefreshTokenException.class, () -> refreshTokenService.rotate("reused-token"));
    }
}
