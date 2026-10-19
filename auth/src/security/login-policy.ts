/** BR-03 / NEXT-253: consecutive password failures before a timed account lock. */
export const LOGIN_MAX_FAILURES = 3;
export const LOGIN_LOCK_MINUTES = 15;

/** Identical for unknown email, incorrect password and active lock; never expose account state. */
export const INVALID_SIGN_IN_MESSAGE =
  'Invalid email or password, or sign-in is locked. After 3 failed attempts, wait 15 minutes and try again.';
