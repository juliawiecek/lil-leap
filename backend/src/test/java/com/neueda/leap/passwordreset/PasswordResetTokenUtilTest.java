package com.neueda.leap.passwordreset;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PasswordResetTokenUtilTest {

    private final PasswordResetTokenUtil tokenUtil =
            new PasswordResetTokenUtil();

    @Test
    void generateToken_shouldGenerateNonBlankToken() {

        String token = tokenUtil.generateToken();

        assertNotNull(token);
        assertFalse(token.isBlank());
    }

    @Test
    void generateToken_shouldGenerateDifferentTokens() {

        String firstToken = tokenUtil.generateToken();
        String secondToken = tokenUtil.generateToken();

        assertNotEquals(firstToken, secondToken);
    }

    @Test
    void hashToken_shouldReturnSameHashForSameToken() {

        String token = "test-reset-token";

        String firstHash = tokenUtil.hashToken(token);
        String secondHash = tokenUtil.hashToken(token);

        assertEquals(firstHash, secondHash);
    }

    @Test
    void hashToken_shouldNotReturnRawToken() {

        String token = "test-reset-token";

        String hash = tokenUtil.hashToken(token);

        assertNotEquals(token, hash);
    }

    @Test
    void hashToken_shouldReturnDifferentHashesForDifferentTokens() {

        String firstHash = tokenUtil.hashToken("token-one");
        String secondHash = tokenUtil.hashToken("token-two");

        assertNotEquals(firstHash, secondHash);
    }
}
