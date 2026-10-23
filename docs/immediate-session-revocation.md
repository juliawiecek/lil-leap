# Immediate session revocation after password changes

Previously, changing a password revoked refresh tokens, but an existing access
token could still authorize requests until its ten-minute expiry. Reducing that
expiry to one minute would only shorten the gap.

Access tokens now identify their session using a `sid` claim containing the
SHA-256 hash of the refresh token. The raw refresh token is never in the JWT.
Auth checks that the session belongs to the caller, has not expired, and has not
been revoked on every protected request.

Orders, Holdings and Insights verify the JWT signature and then call Auth's
`GET /auth/me/session` with the bearer token. Only HTTP 204 allows the request.
Checks are never cached, so a committed password change blocks old access tokens
on their next authorization check, including tokens with time left before expiry.
Requests already authorized before the change can still finish.

The password-changing browser receives a new access/refresh pair and stays signed
in. Other sessions cannot use either their old access token or refresh token.
Login issuance, refresh rotation and password changes lock the user's row to
prevent a concurrent login or refresh from escaping revocation.

## Deployment

- Rebuild and restart Auth, Orders, Holdings and Insights together.
- No database migration or one-minute token expiry is required.
- Each Java service uses `AUTH_SESSION_URL`, defaulting to
  `http://localhost:8081/auth/me/session`. Docker Compose sets
  `http://auth:8081/auth/me/session`. Configure the reachable trusted Auth address
  for other environments, with HTTPS when crossing an untrusted network.
- Existing access tokens without `sid` must be refreshed or replaced by signing in.
- Refresh rotation also invalidates the previous access token.
- Every protected Java request adds a call to Auth. A two-second timeout, a
  transport failure, or any response other than 204 denies access. Auth availability
  is therefore required for protected requests across all four services.

## Verification

Auth unit tests cover token binding and guard rejection. Java tests cover revoked
sessions, authority failures, response statuses and uncached session checks.
The real PostgreSQL test `auth/test/account-settings-sessions.e2e-spec.ts` creates
an isolated database and verifies two-session revocation, the caller's replacement
tokens, audit and notification output, and concurrent refresh/password change.
It also runs the actual Java session-check clients against the real Auth endpoint.

Run the integration test from `auth` with Java 21 available, `JAVA_HOME` set when
needed, and `TEST_POSTGRES_PASSWORD` for a local PostgreSQL user permitted to
create disposable databases:

```text
npm run test:e2e -- --testPathPattern=account-settings-sessions
```

Optional connection variables are `TEST_POSTGRES_HOST`, `TEST_POSTGRES_PORT` and
`TEST_POSTGRES_USER`. The test drops only its generated `ps07_...` database.
