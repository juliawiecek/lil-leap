/**
 * BR-03: a session ends after this many minutes without activity. Same variable
 * (SESSION_INACTIVITY_MINUTES) the database docs and Insights use; defaults to 10.
 * The one-minute BRS note and the rationale for retaining ten minutes are recorded
 * in docs/architecture/ADR-NEXT-253-authentication-policy.md.
 */
export function sessionInactivityMinutes(): number {
  return Number(process.env.SESSION_INACTIVITY_MINUTES ?? 10);
}
