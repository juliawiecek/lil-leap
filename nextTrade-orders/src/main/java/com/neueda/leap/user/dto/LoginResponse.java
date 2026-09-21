package com.neueda.leap.user.dto;

/**
 * Response DTO returned after a successful login.
 *
 * @param token a signed JWT session token, to be sent as a
 *              {@code Authorization: Bearer <token>} header on subsequent requests
 * @param user the authenticated user's public data
 */
public record LoginResponse(String token, UserResponse user) {
}
