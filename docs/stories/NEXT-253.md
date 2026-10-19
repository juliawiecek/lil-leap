# NEXT-253 — Failed sign-in lockout (PS-33 / BR-03)

Identity now maps the existing `users.failed_login_attempts` and `users.locked_until`
columns. Three consecutive incorrect passwords lock sign-in for 15 minutes.
Successful sign-in clears both fields; the next attempt after expiry starts a fresh
failure streak. Attempts during an active lock neither authenticate nor extend it.
No schema migration or unlock scheduler is needed.

Password verification and counter updates run in a PostgreSQL transaction with
`SELECT ... FOR UPDATE` on the normalized account. Failure updates commit before
the generic 401 is thrown, so rejection does not roll them back. This also avoids
lost increments under concurrent requests or across Identity instances.

Unknown emails, incorrect passwords, and active locks all return the same
`401 INVALID_CREDENTIALS` response:

> Invalid email or password, or sign-in is locked. After 3 failed attempts, wait 15 minutes and try again.

Both clients use that fixed message rather than displaying raw server text.
Unknown emails still perform a dummy bcrypt verification; neither the API nor
clients expose per-account attempts or unlock deadlines. Successful user payloads
also omit the lockout fields.

The **ten-minute inactivity timeout remains**, with its rationale and explicit
deviation from the one-minute BRS note recorded in the
[authentication policy decision](../architecture/ADR-NEXT-253-authentication-policy.md).
Reading charts, order reviews and forms can reasonably take more than one minute
without input. Retaining ten minutes keeps the shared clients, server session
expiry and JWT lifetime aligned. The default and existing inactivity behavior
were verified, not shortened silently.

## Verification on 2026-10-19

| Check | Result |
| --- | --- |
| Auth unit suite: `npm test -- --runInBand` | All 161 tests passed across 20 suites. |
| Lockout unit cases in `user.service.spec.ts` | Counting, third-failure lock, commit before rejection, correct-password rejection while locked, no deadline extension, exact expiry boundary, new failure streak, successful reset, normalized row locking, unknown email and database failure. |
| PostgreSQL API suite: `npm run test:e2e -- --testPathPattern=behind-nginx` | All five tests passed against a disposable PostgreSQL 18 database with the real schema, NestJS controllers, TypeORM, bcrypt and sessions. Includes eight concurrent failures, generic responses, persisted expiry/reset, and no sessions issued on rejection. |
| Development seed | Loaded the instrument/demo seeds into the disposable database, locked all three demo accounts, reran `002_test_users.sql`, and verified all three had count 0 and NULL lock deadline. No seed change was needed. |
| Shared session package: `npm test` | All 70 tests passed, including fixed error messages, default ten-minute idle expiry, and no idle reset from refresh or reload. |
| Auth production build | Passed. |
| NextTrade and Insights production builds | Both passed with one build worker and the updated shared package. Existing `app.scss` size warnings remain (26.26 kB / 20.10 kB against 20 kB warning budgets). |
| OpenAPI generation and drift test | Regenerated `auth/openapi.json`; the unit suite confirms it matches the controllers. |

The PostgreSQL instance was stopped after verification. The existing full TLS
Identity suite and Docker browser suite were not run for this story; their changed
message assertions were updated. The targeted PostgreSQL API suite uses the same
plain HTTP deployment mode that Identity uses behind the gateway.
