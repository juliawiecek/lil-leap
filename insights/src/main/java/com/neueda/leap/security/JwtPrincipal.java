package com.neueda.leap.security;

import java.util.UUID;

/**
 * Identity extracted from a validated JWT.
 *
 * <p>Used as the Spring Security authentication principal so downstream
 * controllers can access the caller's identity without re-parsing the token.</p>
 *
 * @param userId the authenticated user's unique identifier, from the token's subject claim
 * @param email the authenticated user's email address, as embedded in the token
 * @param role the authenticated user's role, as embedded in the token's {@code user_role} claim
 */
public record JwtPrincipal(UUID userId, String email, String role) {

	public JwtPrincipal(UUID userId, String email) {
		this(userId, email, "TRADER");
	}
}
