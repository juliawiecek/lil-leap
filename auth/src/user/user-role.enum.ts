/**
 * Every role a user can have. Matches the `users.user_role` CHECK constraint exactly -- the constant
 * names are persisted as-is to `User.userRole` and carried in the token's `user_role` claim.
 * OPERATIONS staff (trade investigation, TS-03.5) are seeded, never self-registered: see
 * {@link REGISTRABLE_ROLES}.
 */
export enum UserRole {
  TRADER = 'TRADER',
  ANALYST = 'ANALYST',
  OPERATIONS = 'OPERATIONS',
}

/** The roles a person can sign up for; operations staff are created by an administrator. */
export const REGISTRABLE_ROLES = [UserRole.TRADER, UserRole.ANALYST] as const;
