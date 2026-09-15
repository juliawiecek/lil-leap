package com.neueda.leap.identity.user.dto;

import java.util.UUID;

/**
 * Response DTO returned for a valid token by {@code POST /verify}.
 *
 * <p>An invalid or expired token returns 401 instead (see
 * {@link com.neueda.leap.identity.common.exception.GlobalExceptionHandler}), not this DTO.</p>
 *
 * @param userId the token's subject — the authenticated user's unique identifier
 * @param email the authenticated user's email address, as embedded in the token
 */
public record VerifyResponse(UUID userId, String email) {
}
