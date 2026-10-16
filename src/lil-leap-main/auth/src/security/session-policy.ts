/**
 * BR-03: a session ends after this many minutes without activity. Same variable
 * (SESSION_INACTIVITY_MINUTES) the database docs and Insights use; defaults to 10.
 */
export function sessionInactivityMinutes(): number {
  return Number(process.env.SESSION_INACTIVITY_MINUTES ?? 10);
}
