# NEXT-215 — Minimum balance applies at account opening

An active, trading-enabled account may submit and execute orders after its cash
falls below the trader-tier opening minimum. Submission and settlement continue
to enforce cash sufficiency for buys and holdings sufficiency for sells.
Account-opening funding is tracked separately in NEXT-214.

The fix removes the minimum comparison from `OrderSubmissionService` and
`JdbcOrderExecutor`. Public interfaces, account-profile fields, and the historical
`ACCOUNT_NOT_SUITABLE` reason remain compatible with existing consumers.

## Regression coverage

- Novice and Advanced accounts below the opening minimum can submit affordable buys and sells.
- Zero-cash accounts with holdings can submit and fill sells.
- Insufficient cash and holdings still reject without creating orders or settlement effects.
- PostgreSQL lifecycle: deposit $5,000, buy 40 shares at $100, sell 10 at $99;
  cash and ledger totals both end at $1,990, holdings at 30, with exactly two fills.
- Duplicate execution of the sell claim creates no additional settlement entries.
- Existing ownership, account status, trading permission, concurrency, idempotency,
  quote, and rollback tests remain passing.

## Pending pull requests checked on 2026-10-13

The standalone change is based on main commit
`025816e5a36a82e8a6840255da94bbd5dcb22454`. All six open PRs were merged locally
in the order below, followed by NEXT-215, on the unpublished validation branch
`validation/NEXT-215-pending-prs` (final commit
`3f082d2d8686d73abda22c563b6c0e339e57ae4c`). The delivery working tree contains
only NEXT-215 changes. The open-PR list and head revisions were rechecked during validation.

| PR | Feature | Tested head SHA |
| --- | --- | --- |
| [#118](https://github.com/juliawiecek/lil-leap/pull/118) | Settlement recovery | `8ba17910e62a20b1f79ee2158069f26c8790c0d0` |
| [#120](https://github.com/juliawiecek/lil-leap/pull/120) | Retry reasons and execution results | `95fae3537dcc42217ab0cf9f189dce705b30f371` |
| [#121](https://github.com/juliawiecek/lil-leap/pull/121) | Order detail and status | `b2e20535a08b25c3dd12d845da9d7544547be1c2` |
| [#123](https://github.com/juliawiecek/lil-leap/pull/123) | Frontend updates | `24802e235ad7bff371efa9ca10d304af486a9757` |
| [#124](https://github.com/juliawiecek/lil-leap/pull/124) | Location validation | `83054e4bfffbbef1da0211d2736f3538411239a8` |
| [#125](https://github.com/juliawiecek/lil-leap/pull/125) | Transactional cash adapter | `a9179ef0d455c906a57a093760136577e9088635` |

Integration conflict resolutions preserve quote-preview and order-detail routes,
ownership and role restrictions, idempotency errors, location checks, retry result
types, and adapter-based cash handling. Integration-only test adjustments retain
US client fixtures and remove an older expectation that quote preview is denied.
The new execution regression verifies settlement effects without depending on
the executor return type or cash-cache SQL implementation.

## Validation results

Windows, Java 25.0.3, Maven 3.9.9, Node 24.19.0, PostgreSQL 18 in a disposable local cluster.

| Check | Result |
| --- | --- |
| Standalone Orders `mvn clean verify javadoc:javadoc` | 216 tests passed, zero skipped; strict Javadoc passed |
| Standalone final executor regression rerun | 23 tests passed |
| Combined Orders verify phase | 288 tests passed, zero skipped; packaging and coverage passed |
| Combined final executor regression rerun | 23 tests passed |
| Combined Holdings `mvn clean verify` | Passed: 130 executed, 21 PostgreSQL tests initially skipped |
| Combined Holdings PostgreSQL reruns | All 21 passed with their environment/system-property opt-ins enabled |
| Combined frontend dependency installation and production build | Passed; `app.scss` exceeded its warning budget (26.26 kB versus 20 kB) |
| Combined frontend suite | 148 tests passed; app test worker failed with JavaScript heap exhaustion |
| Combined frontend app test retry | Heap exhaustion reproduced in isolation with a 1,536 MB heap |
| Combined strict Javadoc | Failed on seven warnings in PR #120's `OrderExecutor` and PR #118's `SettlementException` |

Combined Javadoc warnings concern missing descriptions on the three result
factories, two exception accessors, and comments on two exception fields. These
files are outside the standalone NEXT-215 change. The combined frontend suite
and strict Javadoc are not reported as passing.

Initial follow-up checks exhausted memory alongside frontend workers. Backend
reruns passed with `JAVA_TOOL_OPTIONS=-Xmx512m`; frontend tests used two workers.
The disposable PostgreSQL cluster was stopped after validation. No PR was
published or merged, and no Jira status was changed.
