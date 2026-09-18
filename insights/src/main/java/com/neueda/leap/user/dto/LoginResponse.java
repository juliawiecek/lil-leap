package com.neueda.leap.user.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Response DTO returned after a successful login.
 *
 * @param token a signed JWT session token, to be sent as a
 *              {@code Authorization: Bearer <token>} header on subsequent requests
 * @param user the authenticated user's public data
 */
@Schema(
        name = "LoginResponse",
        description = "Response payload after successful authentication"
)
public record LoginResponse(
        @Schema(
                description = "Signed JWT session token. Include in Authorization header as: Bearer <token>",
                example = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
        )
        String token,

        @Schema(
                description = "Authenticated user's public profile information"
        )
        UserResponse user
) {
    @Override
    public String toString() {
        return "LoginResponse[token=[REDACTED], user=[REDACTED]]";
    }
}
