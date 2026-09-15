package com.neueda.leap.identity.user;

/**
 * The two roles this platform supports at registration time. Matches the
 * {@code users.user_role} CHECK constraint exactly — the constant names are
 * persisted as-is to the {@link com.neueda.leap.identity.user.entity.User#getUserRole()} column.
 */
public enum UserRole {
    TRADER,
    ANALYST
}
