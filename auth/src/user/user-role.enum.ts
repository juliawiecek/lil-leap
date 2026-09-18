/**
 * The two roles this platform supports at registration time. Matches the
 * `users.user_role` CHECK constraint exactly -- the constant names are
 * persisted as-is to `User.userRole`.
 */
export enum UserRole {
  TRADER = 'TRADER',
  ANALYST = 'ANALYST',
}
