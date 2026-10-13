# NEXT-220 - SonarQube quality-gate verification

The current branch passes the existing `lil-leap-gate` in
[LilLeap-Project](http://10.14.137.118:9000/dashboard?id=LilLeap-Project).
Verified on 2026-10-13 at 20:42:31 UTC for implementation revision
`114d977675807605755c6052a5d66ddeed9103fd`, analysis
`f5aa76ad-dcf4-474f-ac4b-0292be9d3542`.

| Gate measure | Result | Existing limit |
| --- | --- | --- |
| New-code coverage | 96.3% | At least 95% |
| Overall duplication | 2.1% | At most 3% |
| New-code duplication | 0.21112% | At most 2% |
| New violations | 0 | 0 |
| Overall/new high and medium issues | 0 | Existing gate conditions passed |
| Security rating | A | A |

Overall coverage is 94.6%; the gate's 95% coverage requirement applies to new
code. Bugs, vulnerabilities, code smells and security hotspots are all zero.
All conditions passed with none ignored. Gate thresholds, active profile rules,
CPD exclusions and the previous-version baseline were preserved. Remediation
scans retained project version `53`, with new-code baseline version `52`.
The assigned profiles have `texoma-*` names and exactly match the committed
rule configurations; validation now compares those rules by language.

## Changes

The private `shared/session-core` package owns auth, refresh rotation, idle
expiry, session coordination, guards/interceptor and URL synchronization. The
apps retain their storage keys, roles, routes and sample-data behavior. Existing
stored sessions remain compatible. Angular dependencies are peers and consumers
install compiled local copies. Docker uses repository-root build contexts;
Jenkins prepares and tests the shared package before building each app.

The coverage fixes move existing auth and keeper tests with their code and add
workspace rendering, route loaders, Analyst sign-in, URL hydration, 401 handling,
invalidation subscriptions and late-response/revocation races. Required lifecycle
interfaces and simpler conditional expressions satisfy the active profiles.

Coverage preparation qualifies Java package paths with their service directory.
The original JaCoCo reports remain intact, and counter values are unchanged.
This prevents equal Java package/class names in separate services from attaching
coverage to the wrong file. Shared LCOV is imported once.

## Validation

| Check | Result |
| --- | --- |
| Shared session tests and coverage | 54 passed; coverage command passed |
| Trading tests and coverage | 145 passed; coverage command passed |
| Insights UI tests and coverage | 34 passed; coverage command passed |
| Auth service tests | 88 passed |
| Python pipeline tests | 85 passed |
| Orders Maven clean verify and analysis dependencies | 253 passed; 24 PostgreSQL cases skipped |
| Holdings Maven clean verify and analysis dependencies | 130 passed; 21 PostgreSQL cases skipped |
| Insights Java Maven clean verify and analysis dependencies | 63 passed |
| Coverage/configuration script tests | 9 passed |
| Both app production builds | Passed |
| Both app browser regressions | 30 passed; 4 inapplicable project cases skipped |
| Pending-PR integration tests/coverage | 146 trading and 34 Insights tests passed |
| Pending-PR production builds and browser regressions | Passed; 30 browser checks passed |

Pending PRs tested: #121 at `41024f91f05410b78cbc076cc2ec4b43af58560c` and
#123 at `24802e235ad7bff371efa9ca10d304af486a9757`, on unpublished validation
branch `validation/NEXT-220-pending-prs` (commit
`a60de395461ad789f4b4c0d35fe033e789e11fc7`). Its existing UI stylesheet budget
warning remains: 26.26 kB against a 20 kB warning budget. Source behavior is shared
with the passing delivery implementation.

Local tooling: Node 24.19.0, Java 25.0.3/Maven 3.9.9, Python 3.13.2, Edge and
SonarScanner for NPM 5.0.2. Browser APIs are mocked; nginx and Docker container
builds were not run locally. The PostgreSQL opt-in cases above were not rerun
for this frontend/analysis change. Sonar reports no coverage-import errors after
the path fix; Java preview/unresolved-type warnings remain informational.

The initial scanner attempt exhausted local disk space. Disposable packaged
archives and completed raw coverage JSON artifacts were removed while retaining
the reports needed for analysis, then scanning completed successfully.

As requested, this branch was analyzed in the project's existing main analysis
slot. Source commits remain local. A documentation-only commit records these
results, followed by a final scan of that branch head; the recorded source
implementation and coverage are unchanged.
