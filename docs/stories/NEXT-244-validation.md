# NEXT-244 follow-up audit and validation

Audited on 22 October 2026 on `feat/chart-accessibility`, starting from
`06513c5` (`feat(NEXT-244): feed every chart from real data`). The working tree
was clean. Earlier main-branch edits remain in the existing stash.

## Chart audit

| Chart / surface | Source on this branch | Remaining issue found | Follow-up |
| --- | --- | --- | --- |
| Novice portfolio value | Cash activity, filled orders, historical bid closes and raw bid history; current bid-valued account snapshots | Non-finite cash could pass reconciliation | Reject invalid ledger fields before reconciliation; retain unavailable-history state |
| Novice allocation donut / asset classes | Existing PS-06 cash and holdings valued at recorded bids | No fixed percentages remain | Preserve exact arc proportions for tiny positions and shared rounded display percentages |
| Advanced historical prices / candles | Existing candles endpoint and quote history, plus shared live feed | New intervals synthesized OHLC from one latest quote; mixed raw observations were omitted from inspection | Preserve latest quotes as raw points, show their price line alongside candles, and include them in inspection and tables |
| Advanced EMA 50 / 200 | SMA-seeded EMA on recorded candle closes | No fixed readings remain | Preserve calculation; add independent 50/200-period numerical fixtures |
| RSI 14 | Wilder smoothing on recorded candle closes | No fixed readings remain | Preserve shared plotted, described and tabulated series |
| Volume / VWAP | Actual reported volume only; current backend supplies none | Invalid OHLC could enter the exported VWAP utility | Reject malformed inputs; keep production unavailable state; test zero/missing volume |
| Advanced exposure ring / split bars | Same PS-06 cash and bid-valued holdings as summaries | No fixed percentages remain | Preserve market-valuation availability gate and shared categories |
| Trade markers / average-cost references | Filled order fields; authoritative holding average cost | Marker mapping fell back to submitted quantity and formatted invalid timestamps before validating | Require valid executed quantity, price, timestamp and side; use New York time |
| Live SVG stock dashboard / reusable real-time chart | Existing authenticated quote history and latest-quote adapter | No production sample arrays found | Preserve adapter, sampling and interaction behavior |
| Advanced sectors / heat map | Existing PS-06 shared quote feed and session baselines | No fixed returns found | Preserve existing comparisons and PS-25 tables |
| Insights hourly activity / most-traded rankings | Existing live reporting endpoints | No production sample arrays found | Preserve actual report datasets and shared descriptions |
| Sign-in artwork | Decorative SVG/canvas, hidden from assistive technology | No financial labels or user-account claims | Decorative artwork is outside financial data series |

`makePath`, random financial samples, fixed EMA/RSI readings, fixed volume labels
and fixed allocation percentages were already removed before this follow-up.
The remaining fabricated quantity fallback and synthetic live OHLC construction
are removed here. Design constants, periods and mathematical coefficients remain.

## Architecture and ownership

Continue to use `shared/chart-data.ts` and the existing Angular adapter for
normalized epoch-millisecond `{time,value}` series. OHLC metadata, executions
and allocation categories retain their richer structures. No new API or polling
service was created. The existing history cache, token isolation and request
generation guards remain in use. Empty successful history responses now clear
prior series, and missing instrument IDs invalidate outstanding requests.

PS-06 is present in commit `fd56a94`: portfolio valuation, cash, holdings, feed
polling and sector comparisons are reused. Shared ownership remains confined to
the chart-related parts of the dashboard, portfolio and market-feed files; trading
rules and submission flows are unchanged. No external coordination message was sent.

PS-25 uses the same normalized observations for descriptions and exact/grouped
tables. Mixed candle/raw-price keyboard inspection now includes the latest raw
observation rather than silently excluding it. Current theme tokens, palettes,
line patterns, hollow/filled candles, privacy and high-contrast styles are retained.
No sonification implementation or explicit pause-live setting was found in the
checked-out chart code; no replacement PS-26 audio implementation was invented.

## Backend evidence and limits

* Quote history is `/api/v1/quotes/history/{instrumentId}`, capped at 1,000 rows.
  Candles support 1m, 5m, 15m, 1h and 1d with up to 500 intervals.
* There is no portfolio-history endpoint. Existing reconstruction uses historical
  transactions and bids, never current holdings projected backwards. The last
  recorded bid at or before a valuation is carried forward; future prices and fill
  prices are not substituted. Missing valuations restrict the supported suffix.
* History reads default to all orders (`OrderHistoryService`); the production
  schema enforces `UNIQUE(order_id)` on fills. This application supports one fill
  per order. Supporting multiple execution records would require a richer backend
  contract; submitted quantities are never used to invent missing executions.
* Reconciliation compares reconstructed quantities and cash with the current
  snapshot. It cannot certify a missing net-zero round trip in an imported ledger.
* The application asset model is cash plus stock holdings. No additional asset
  classes or market volume are supplied, so neither is invented.
* Persisted quotes currently come from the application's existing synthetic quote
  engine. These changes use authoritative application records; they do not turn
  those records into externally sourced exchange prices. The live dashboard's
  existing synthetic-data disclosure remains. External market-data ingestion is
  a separate backend capability.

## Verification

* Production Angular build passes, including TypeScript and Angular template
  compilation. Existing SCSS size-budget warnings remain; no stylesheet changed.
* 14 chart-data tests pass, including normalization, EMA 50/200, Wilder RSI,
  VWAP, missing volume, stale responses, invalid execution fields, invalid ledgers,
  new live intervals and successful empty refreshes.
* 28 chart component, portfolio-history, portfolio-API and trade-marker tests pass.
* All 7 chart-interaction tests pass. The previous memory failure was an assertion
  trying to print an entire SVG/Angular object: two empty-chart checks selected an
  accessibility-button icon instead of the removed plot. Select `svg[role="img"]`.
* Browser chart-accessibility regressions: 5 passed, 1 skipped (Insights-only test
  excluded by the NextTrade project). Covers equivalent tables, speech, volume,
  forced colors, sector comparisons, privacy, stock/timeframe changes and mobile.
* Test fixtures now include the executed purchase behind every holding and the
  matching deposit. Volume-table selectors use its ID, rather than selecting RSI
  through `.last()` after the RSI panel was introduced.
* No lint target is configured in `frontend/package.json`. `git diff --check` passes.
* No backend files changed in this follow-up, so Spring Boot tests were not rerun.

Full frontend run: 439 passed, 3 failed (442 reported tests including the crashed
interaction file). Each failure was resolved and its suite rerun:

* Chart interactions: all 7 pass after targeting the plot rather than button icons.
* Palette/financial signals and novice dashboard: all 53 pass. The VWAP fixture
  previously changed high/low/close while leaving open outside their range; it
  now supplies coherent OHLC. An attempted rounding of the novice arc hid tiny
  holdings, so that change was removed and the original precise arc was retained.

The whole suite was not repeated after these corrections; all failed suites
were rerun successfully. Logs are `frontend/tests-next244.log`,
`frontend/interactions-next244.log`, `frontend/regression-next244.log`,
`frontend/e2e-next244.log` and `frontend/build-next244.log` (ignored local artifacts).
The live-backend axe suite was not run; the browser chart suite uses mocked APIs.

## Files in this follow-up

Production: `advanced-dashboard.ts`, `market-feed-api.ts`,
`portfolio-history.ts`, `technical-chart-math.ts`, `technical-chart.ts`,
`technical-chart.html`, and `trade-marks.ts` under `frontend/src/app`.

Tests: `chart-data.test.mjs`, `chart-data-components.test.mjs`, and
`chart-interactions.test.mjs` and `non-colour-signals.test.mjs` under `frontend/tests`; `chart-access.spec.mjs`
and `colour-fixtures.mjs` under `frontend/e2e`. This report is the added document.
No dependencies or backend endpoints were added.

## Acceptance evidence

Presentation follow-up (23 October): the portfolio keeps its original emerald gradient,
bounded smooth curve and interactions. Dense displays retain actual first/last and
interval high/low observations; no averaged value is attached to a historical timestamp.
The full-resolution table remains available. A minimum display scale keeps quiet
periods from appearing excessively volatile, while larger moves fit naturally. The
SVG, tooltips and accessible plotted series use the same retained observations.
Raw live prices in the technical chart continue from its last candle instead of
overlaying the complete candle history. Mobile range controls and end tooltips stay
inside the chart. Routine account-value notes sit beneath the graph.

The recent-hour viewport also fits its first and last available observations to
the full width. It still filters to the latest hour, but leaves no artificial blank
space when only part of that hour is recorded. The displayed Central-time range
identifies the actual span. SVG rendering and inspection share the same viewport.
The follow-up's 29 focused tests and Angular build passed; browser checks using
an 18-minute fixture confirmed both plot edges at desktop and phone widths.

Executed presentation checks: 69 focused frontend tests passed, TypeScript no-emit
check passed, Angular production build passed with existing component CSS size
warnings, and isolated browser checks passed at 1440px and 390px using test API
fixtures. No backend changes were required for this presentation follow-up.
The expanded run exposed a test that expected the machine's UTC weekday while the
UI correctly used Central time. Its fixture now explicitly covers that date boundary
with a fixed timestamp; the rerun passed. Final logs are under the ignored
`frontend/test-results/chart-presentation-final.log` and
`frontend/test-results/chart-presentation-build.log` paths.

* AC1: The existing normalized contract and richer OHLC/trade/allocation models
  feed the implemented visuals, PS-25 tables/summaries and keyboard inspection.
  Mixed raw/candle inspection is covered by a rendered component regression.
  PS-26 sonification is not implemented on this branch, so audio cannot be certified.
* AC2: No production random sample arrays or fixed financial indicator/allocation
  labels were found in the audit. The remaining submitted-quantity fallback and
  single-tick OHLC construction are removed. Missing market volume and incomplete
  portfolio histories report unavailable rather than substituting values. Backend
  synthetic quotes remain the explicit source limitation described above.
* AC3: Mapping and calculation tests, component tests, keyboard regressions and
  browser alternatives checks pass for the changed behavior. Full-suite status
  is recorded separately rather than inferred from these focused results.

## Timeframe accuracy follow-up (23 October 2026)

The portfolio's Full day view now means the current Central-time calendar day,
starting at midnight. It includes actual account activity on weekends and holidays
instead of selecting the previous weekday's regular trading session. Tests cover
Central/UTC date boundaries and both daylight-saving transitions. The remaining
selectors explicitly disclose rolling 7, 30, 90 and 365 days; ALL means available
recorded history, bounded by first funding and the records the backend supplies.

Every timeframe now positions observations by elapsed time, including 1W and ALL.
The chart fits the observed span and displays its actual Central-time range.
Missing earlier history is disclosed beneath the plot, and the change label says
"Available history" rather than attributing a partial record to an entire year.
Shared `ChartSeries.coverage` exposes requested and observed bounds and an
empty/partial/complete status to descriptions and future chart consumers. This
describes supported range coverage; it does not certify the completeness of an
external transaction ledger or provide missing market observations.

Changes retain the first actual value, including zero. A zero starting balance
has a dollar change but no defined percentage. Loading, error and insufficient
history states show "Change unavailable" instead of substituting today's change.
Visible labels, speech and chart descriptions follow the same coverage rules.
Account value continues to include deposits and transfers, as stated beneath the
chart; it is not a cash-flow-adjusted investment return.

Executed verification:

* Full frontend unit suite, serial execution: **456 passed, 0 failed**.
* Final focused chart, portfolio, component and spoken-label tests: **107 passed,
  0 failed**, including the last zero-baseline regression adjustment.
* TypeScript application no-emit check: passed.
* Angular production build: passed with existing component CSS budget warnings.
* Isolated browser checks with test API fixtures: all six timeframes display the
  correct range definitions and partial-history disclosure; desktop (1440px) and
  phone (390px) checks passed without horizontal overflow.
* No backend changes were needed; backend tests were not rerun in this follow-up.

Logs: `frontend/test-results/timeframe-full-tests.log`,
`frontend/test-results/timeframe-fixes.log`, and
`frontend/test-results/timeframe-build.log`. Browser screenshots are
`frontend/test-results/timeframe-history-1440.png` and
`frontend/test-results/timeframe-history-390.png` (ignored local artifacts).

Remaining source limits: daily historical requests still cap at 500 bars, and
the underlying application quote engine remains synthetic. Longer ALL histories
can therefore be partial; the UI now makes that limitation visible. This follow-up
does not add external exchange prices, reconstruct absent records, or make
unavailable volume/VWAP data available.

The subsequent visibility experiment was reversed at the user's request. The
final presentation retains the earlier line, scale and display density; added
high/low labels, grid lines, time-axis labels and sparse-span styling were removed.
After reversal, all 32 relevant portfolio/component/interaction tests passed and
the Angular production build passed with the existing CSS size-budget warnings.
Logs: `frontend/test-results/chart-visual-revert-tests.log` and
`frontend/test-results/chart-visual-revert-build.log`.
