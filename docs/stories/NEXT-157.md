# NEXT-157 — Real Identity registration and login browser tests

The shared Playwright suite in `e2e/` builds both Angular apps and the final
NestJS service in `auth/` using the production Dockerfiles. Requests pass through
the real gateway; Identity persists users in isolated PostgreSQL initialized
from the production schema. No authentication responses or tokens are mocked.

Insights retains its analyst login screen. Trader registration uses NextTrade's
Create account tab and complete investor-profile wizard. Analyst fixture setup
calls the real Identity registration API.

## Acceptance coverage

| Criterion | Coverage in `e2e/tests/auth.spec.ts` |
| --- | --- |
| AC1 | Shared Playwright `auth` project exercises both apps; each app exposes `test:e2e:auth`. |
| AC2 | Browser registration succeeds; missing name, malformed email, weak password, password mismatch, and incomplete profile display validation feedback without registration requests; duplicate email displays the real HTTP 409 rejection. |
| AC3 | Each app accepts its role's valid credentials and opens the workspace; wrong passwords and unknown accounts return HTTP 401 and leave the user signed out. Reload performs real refresh-token rotation and restores the workspace. |
| AC4 | Production NestJS Identity, real PostgreSQL, production Angular builds, and the real gateway. Newly registered traders can log in again and read their opened account and initial balance through authenticated APIs. |

## Run and collect evidence

From the repository root with Node 24 and Docker Compose v2:

```powershell
npm --prefix e2e run test:auth
npm --prefix e2e run test:stack
```

The first command runs all 13 NEXT-157 cases. The second also runs the existing
journey and session regressions (22 tests total). `npm run test:e2e:auth` in
either Angular app invokes the same real-stack authentication run.

Each invocation uses a unique Compose project and fresh database volumes.
Reports live under `e2e/artifacts/<compose-project>/`: phase-specific JUnit and
HTML reports, failure screenshots/traces, container logs, and `run.json` recording
the requested/completed phases and final status. Cleanup removes only that
project's containers and volumes. A failed prerequisite, service, assertion,
or cleanup produces a nonzero exit code.

The existing Jenkins Playwright stage runs `scripts/run_e2e_ci.sh`, clears old
reports before execution, and publishes the artifacts even when the run fails.
To establish completion, run the full suite successfully twice with fresh
databases and record both Jenkins build URLs and archived reports here.

## Verification status — 2026-10-15

- Playwright discovers 13 authentication cases and 22 cases across all projects.
- The stack runner passes Node's syntax check; the Compose file parses as YAML.
- Both Angular production builds pass (`npm run build` in each app).
- 31 targeted unit tests pass: NextTrade's `auth-api`, `app`, and `profile-form`
  tests (26), plus Insights' `login` tests (5).
- Six supplementary Edge browser checks pass against the production static
  build: the five client-validation cases in `auth.spec.ts` and navigation
  through the complete profile to its review screen. This local check used a
  temporary configuration without service readiness setup and did not submit
  registration or exercise login; it is not real-stack acceptance evidence.
- The real-stack command exits with code 1 and an explicit Docker-unavailable
  message locally; unknown runner options also fail instead of silently running
  a different suite.
- Real-stack execution is **unverified**: Docker is unavailable in this workspace,
  and the documented Jenkins endpoint `http://10.14.137.118:8080/` times out.
- Jenkins build references: pending. No successful real-service run is claimed.

The separate NEXT-220 browser suite uses mocked APIs and is not acceptance
evidence for this story. Local compilation and client-validation checks likewise
do not substitute for the required real-service run.
