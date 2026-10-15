# NEXT-163 — Shared JWT interceptor and route guards

Both Angular apps register the shared interceptor and guards from
`@lilleap/session-core/angular`. Business services use its injectable
`ApiHttpClient` GET/POST wrapper, which delegates to Angular `HttpClient`.
NextTrade's submission, account/catalog, history, portfolio, market-status and
quote calls and Insights' live reporting all pass through that pipeline.

## Acceptance mapping

| Criterion | Implementation |
| --- | --- |
| AC1 | The interceptor captures the current access token and adds one Bearer Authorization header to same-origin `/api/` requests. GET/POST bodies, parameters, and unrelated headers are preserved. |
| AC2 | Protected-route guards await restoration and check inactivity, required app role, and finite future token expiry. Absent, malformed, expired, rejected-restoration, and wrong-role sessions cannot open protected content. |
| AC3 | An API 401 invalidates the token actually sent before domain parsing, stops session activity, clears persistence, and redirects to login with a safe local return URL. Concurrent failures redirect once; failures from older tokens preserve newer logins. |
| AC4 | Both apps' business clients use the same typed Angular HTTP wrapper, completing the current shared-client integration for NEXT-153. Authentication operations retain the shared Identity client. |

JWTs are not automatically attached to Identity login/reset calls, static assets,
or external URLs. This is the agreed interpretation of application-wide outgoing
requests. There are no automatic retries, including for order submissions.
Non-401 errors retain domain error handling without signing the user out.
The server verifies JWT signatures; browser guards do not replace server checks.

Business method signatures, API paths, response normalization, order validation,
and session storage formats remain compatible. Internal business-client
constructors now require the shared transport instead of a fetch implementation.
No database or backend API migration is required.

## Verification

Rebuild the shared package and reinstall its copied dependency in both apps:

```powershell
npm --prefix shared/session-core run build
npm --prefix frontend ci
npm --prefix insights-frontend ci
npm --prefix shared/session-core run test:coverage
npm --prefix frontend run test:coverage
npm --prefix insights-frontend run test:coverage
npm --prefix frontend run build
npm --prefix insights-frontend run build
npm --prefix frontend run test:e2e
```

Tests exercise the actual Angular HTTP pipeline in the shared package and each
app configuration. They cover GET/POST headers and payloads, rotation, exclusions,
empty/malformed/JSON 401 bodies, concurrent failures, stale requests after a new
login, non-401 responses, and protected routes. The existing real-stack suite
also verifies NestJS-issued tokens, guards, and server-expired-token 401s in both
apps: `npm --prefix e2e run test:stack` requires Docker Compose v2.

The local browser suite uses mocked service responses and is regression evidence;
it does not establish real NestJS integration acceptance.

Results on October 15, 2026:

| Check | Result |
| --- | --- |
| Shared session/HTTP package | 69 tests passed; 98.58% lines |
| NextTrade | 168 tests passed; 97.05% lines |
| Insights | 45 tests passed; 100% lines |
| Shared HTTP wrapper | 100% lines, branches, and functions |
| Both Angular production builds | Passed |
| Edge browser regressions | 31 passed; 3 app-specific cases skipped |
| Identity | 145 tests passed |
| Python pipeline | 85 tests passed |
| Orders | 284 passed; 26 database-dependent cases skipped |
| Holdings | 130 passed; 21 database-dependent cases skipped |
| Insights Java | 63 tests passed |
| Coverage/report validation | Passed; all eight assigned profile exports match |

The existing Insights workspace had four missing-brace findings under rule
`typescript:S121`. These were corrected without changing behavior; its tests,
coverage, and production build passed again.

## SonarQube status

**Passed** the existing `lil-leap-gate` in
[LilLeap-Project](http://10.14.137.118:9000/dashboard?id=LilLeap-Project)
on **2026-10-15 at 14:28:48 UTC**. Analysis ID:
`4568b783-e446-4ee7-bf14-bbbbca292336`.

| Gate measure | Result | Existing limit |
| --- | --- | --- |
| New-code coverage | 96.8% | At least 95% |
| New-code duplication | 0.0% | At most 2% |
| Overall duplication | 2.0% | At most 3% |
| New issues | 0 | 0 |
| Overall/new high and medium issues | 0 | All existing conditions passed |
| Overall/new security rating | A | A |

All conditions passed with none ignored. Overall coverage is 94.4%; the 95%
gate threshold applies to new code. Bugs, vulnerabilities, code smells, and
security hotspots are all zero. Assigned profiles, gate thresholds, exclusions,
and previous-version baseline `61` were preserved; analysis retained project
version `62`. The approved scan used the project's existing main analysis slot.

The scan covers the local working tree based on revision
`ef7994b49481aad26131b1e07dbceba3134c35ac`, including pending changes, rather than
claiming that revision alone contains this implementation. The scanned source
fingerprint is
`a7ff7dc05035be2a761441d8894e04aba06992fbb57ea3f243ba540d5c076c53`.
Per-file hashes, server gate results, and scanner output are retained locally in
`e2e/artifacts/next163-source-manifest.json`, `next163-sonar-result.json`, and
`next163-sonar-final.log`.

Scanner warnings remain for missing SCM blame on pending files and pre-existing
Java unresolved types/preview features. No coverage-import errors were reported.
The four brace findings were resolved in code; no rules or conditions were waived.

Real-stack execution remains pending: Docker is unavailable locally, and Jenkins
now responds but requires authentication. No real-service browser pass is claimed.
