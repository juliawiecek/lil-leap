/** Only the application's same-origin protected endpoints receive credentials. */
export function isProtectedRequest(url: string, origin: string): boolean {
  const target = new URL(url, origin);
  return target.origin === new URL(origin).origin &&
    (target.pathname.startsWith('/api/') || target.pathname.startsWith('/rules/'));
}

/** A late failure from an old request must not invalidate a newer login. */
export function shouldEndSession(status: number, sentToken: string | null, currentToken: string | null): boolean {
  return status === 401 && sentToken === currentToken;
}
