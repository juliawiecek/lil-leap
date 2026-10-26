/**
 * BR-03: passwords age out. A password older than PASSWORD_MAX_AGE_DAYS no longer signs in; the
 * user gets a reset link instead. PASSWORD_EXPIRY_WARNING_DAYS before that, one "expires soon"
 * email goes out. Both are env-tunable for demos; the defaults are the policy.
 */
export const PASSWORD_MAX_AGE_DAYS = wholeNumber('PASSWORD_MAX_AGE_DAYS', 90, 1);
export const PASSWORD_EXPIRY_WARNING_DAYS = wholeNumber('PASSWORD_EXPIRY_WARNING_DAYS', 14, 1);
/** How often Identity looks for passwords entering the warning window; 0 turns the sweep off. */
export const PASSWORD_EXPIRY_SWEEP_MINUTES = wholeNumber('PASSWORD_EXPIRY_SWEEP_MINUTES', 60, 0);

if (PASSWORD_EXPIRY_WARNING_DAYS >= PASSWORD_MAX_AGE_DAYS) {
  throw new Error('PASSWORD_EXPIRY_WARNING_DAYS must be smaller than PASSWORD_MAX_AGE_DAYS.');
}

export const PASSWORD_EXPIRED_MESSAGE =
  'Your password has expired. We have emailed you a link to choose a new one.';

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a password set at `changedAt` stops working. */
export function passwordExpiresAt(changedAt: Date, maxAgeDays = PASSWORD_MAX_AGE_DAYS): Date {
  return new Date(changedAt.getTime() + maxAgeDays * DAY_MS);
}

/** True once the password's maximum age has passed. A row without a date is treated as fresh. */
export function passwordExpired(changedAt: Date | null | undefined, now = new Date()): boolean {
  return !!changedAt && passwordExpiresAt(changedAt).getTime() <= now.getTime();
}

/** Whole days left before expiry, never negative; "today" is 0. */
export function daysUntilExpiry(changedAt: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((passwordExpiresAt(changedAt).getTime() - now.getTime()) / DAY_MS));
}

function wholeNumber(name: string, fallback: number, minimum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be a whole number of at least ${minimum}, not "${raw}".`);
  }
  return value;
}
