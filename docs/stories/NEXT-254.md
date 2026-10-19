# NEXT-254 — Trading-day price-change baseline (PS-34)

Day change now uses an indexed baseline lookup in Holdings rather than the oldest
row of a capped recent-history response. The chart's 1,000-row limit stays separate
from the day-change calculation.

`GET /api/v1/quotes/day-opens?ids=<comma-separated UUIDs>` returns one baseline
quote per instrument, omitting instruments with no applicable quote. The server
captures one current instant for the batch and uses `America/New_York` to select:

- On regular weekdays at or after 09:30: the first recorded quote at or after
  09:30, no later than the current instant or the 16:00 session close.
- Before 09:30 and on weekends: the last available quote at or before the
  preceding weekday's 16:00 close, excluding overnight and premarket ticks.

The queries return at most one row per instrument and use the existing
`(instrument_id, quoted_at DESC)` index. The endpoint accepts at most 100 IDs,
deduplicates them, and has the same authenticated Trader/Analyst access as the
other Holdings quote reads. Gateway and Angular development-proxy routes send it
to Holdings.

The shared frontend feed reads baselines in one batch per five-second refresh.
It no longer caches an opening price until the browser's local midnight. This
allows an already-open tab to move from previous close to session open and retry
when the first session quote has not arrived. Missing or failed baseline reads
produce the existing unknown-change value (0), rather than reusing an earlier
session's baseline. No browser-local date enters the baseline request.

## Acceptance coverage

| Requirement | Evidence |
| --- | --- |
| First quote at/after 09:30 New York, previous close before open | Actual JDBC tests include premarket/after-hours noise, the exact opening boundary, delayed first quotes, missing quotes, and weekends. |
| Correct beyond one history page | The JDBC regression stores 1,500 five-second quotes, proves the opening quote is absent from the latest 1,000 rows, and retrieves the same opening baseline at 17:00 and 23:00 UTC. |
| Independent of browser zone and DST | Baseline selection happens on the server. Parameterized tests vary the JVM default zone across UTC, Tokyo, Honolulu, Warsaw, and Los Angeles; winter, summer, and both US DST transitions retain the correct New York opening instant. |
| A running tab follows session changes | Feed tests replace a premarket baseline, temporarily omit the opening quote, retry it, and recover from a failed baseline request. |

## Verification

From `nextTrade-holdings/`:

```powershell
mvn -B verify
$env:JAVA_HOME = 'C:\Users\Administrator\.jdks\ms-21.0.12.1'
mvn -B javadoc:javadoc
```

From `frontend/`:

```powershell
node --test --test-concurrency=1 tests/*.test.mjs
$env:NG_BUILD_MAX_WORKERS = '1'
npm run build
```

Results on 2026-10-19:

- All 251 frontend tests passed, with none skipped.
- Holdings verification passed: 204 tests executed, 28 existing integration cases
  skipped by their environment opt-ins; no failures or errors.
- Production frontend build passed using one worker, with the existing
  `app.scss` warning (26.26 kB versus a 20 kB warning budget).
- Strict Javadoc passed with JDK 21. Two existing `CandleInterval` accessors needed
  main descriptions added to their comments to satisfy the strict documentation gate.

Repository regressions execute the JDBC selection SQL against H2. API and security
tests use MockMvc, and frontend tests use controlled HTTP responses; these checks
do not claim a deployed-stack browser or live PostgreSQL run.
