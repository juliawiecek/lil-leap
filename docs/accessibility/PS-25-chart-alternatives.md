# NEXT-245 / PS-25 — Chart explanations and tables

[Jira story](https://lilleap.atlassian.net/browse/NEXT-245): CHART-2, CHART-3 and VOICE-9.

## Architecture inspected before implementation

Both applications use Angular 22 and native SVG. There is no Chart.js, D3, Highcharts,
ECharts or other chart-library API to wrap. The drawing and data pipelines remain intact.

| Surface | Data and renderer | Alternative |
| --- | --- | --- |
| Novice portfolio | `PortfolioChart`, `ValuePoint[]`, real portfolio-history reconstruction and `SvgRangeAnimation` | Summary and table use `chartSeries().points`, matching the displayed `plotPoints`, including the recent-hour/full-day choice. Loading/error states have no stale numbers. |
| Advanced live price and reusable realtime chart | `StockSvgChart`, `StockChartViewport`, authenticated price/history stream | The visible, revealed recorded ticks feed the summary and table. Animation interpolation and pixel reduction do not create observations. |
| Historical price, candles and indicators | `TechnicalChart`, real `PricePoint[]`, OHLC metadata, EMA 50/200 and bar VWAP | Current viewport prices, genuine high/low, indicators, average-cost comparison and fills. Each trade retains its exact timestamp, including fills between bars. |
| Historical volume | Native SVG volume bars, display OHLC aggregation | A separate description/table uses the actual displayed volume bars and their start/end times, with an option for every original observation. Missing bars remain explicitly unavailable, distinct from reported zeroes. |
| Allocation donut | Actual invested holdings grouped by sector from `sectorAllocation` | Sector values and invested percentages; cash is stated separately; focusable named image, explanation and category table. |
| Exposure graphic | The current UI uses a split bar, not the old ring CSS | Actual equities/cash values and percentages; same alternatives as allocation. |
| Sector bars (Overview list, Market Overview and Markets) | `AdvancedDashboard.sectors`, equal averages of current listed-stock changes, scaled CSS bars | Per-instance named/focusable graphics, calculated category explanations and exact return tables. These describe comparisons, not a fictional time trend between sectors. |
| Market performance heat map | First nine current `quotes` in `heatMapQuotes`, native stock-selection buttons and CSS intensity | A named interactive group with linked summary, Explain and table. Each tile's financial graphic has `role="img"` and a linked description. Native button semantics and stock selection are retained. |
| Insights activity | `InsightsChart`, `LIVE_REPORTS.activityTrend` | Actual hourly labels and trade counts, description, table, focus narration and stored opt-in. |
| Insights stock ranking bars | `InsightsPage.top`, `LIVE_REPORTS.topInstruments`, bars scaled to the actual busiest stock | A named, focusable graphic with a linked calculated ranking summary, Explain, and a table of exact stock/count/relative-share values. The original visual layout is retained. |

No RSI chart or financial sparkline is rendered in this checkout. These are not replaced with
mock data. Future renderers can use `describeSeries` and `ChartAccess`. Landing-page Canvas/SVG
candles, icon SVGs, and legend samples are decorative rather than financial observations; they
retain their hidden/inert treatment.

Position-weight bars inside the holdings table and allocation-legend meters repeat adjacent
exact numeric values. These decorative duplicates stay `aria-hidden`; their underlying table
or allocation alternatives retain the same information. Client Detail allocation provides its own explanation and cost-basis table. Old exposure-ring/RSI/sparkline styles are not rendered.

Existing accessibility foundations: PS-17's `AccessibilityStore` and startup hooks, PS-18's
briefing speed, PS-19's switch scanner and queued speech, PS-27's theme tokens, and PS-28's
financial formatter, shapes, indicator dashes, hatching, keyboard inspection and contrast modes.

Jira NEXT-244 / PS-24 is the real-data prerequisite, titled **Feed every chart from real data**;
the story does not define Voice Mode. This branch already supplies its real history/quote/bar,
holdings and report data. PS-22 supplies Voice mode with Brief/Detailed levels, speech priorities and a shared briefing speed.
PS-25 integrates the existing `voice` settings section, briefing rate, speech formatter and switch
scanner, and exposes a stored chart-speech opt-in. It honors the current `voice.enabled` setting
when no explicit chart override exists, without overwriting other voice settings.

Sector allocation uses numbered slice labels matched to its legend. PS-28 browser checks cover visible category labels, exact values/shares and the native table, plus the retained system-colour arc and
legend borders in forced colours. The historical chart's hollow/filled candles, indicator dashes
and reported-volume hatching remain unchanged and are covered by the existing regression tests.
The portfolio geometry check also retains the existing loss-state dashed stroke instead of
incorrectly requiring a solid stroke after a falling-price update; endpoint continuity is still checked.

## Design

- `shared/chart-description.ts` contains pure, dependency-free descriptions and table models,
  shared by both applications. Descriptions include the period, first/last recorded values,
  overall direction and percentage change, plus dated extrema. Zero baselines explicitly have
  no percentage; single observations have no inferred trend; empty/invalid data has no invented
  values. Dates name New York's time zone and include the year and seconds.
- `ChartAccess` provides native buttons, stable per-chart IDs, a persistent `aria-describedby`
  target, a polite atomic live region, and a native table with caption and scoped row/column
  headers. The chart retains its name and `role="img"`; `ChartFocus` connects focus and speech.
  Buttons remain mounted and focus stays on the toggle when content expands/collapses.
- Alternative tables use the chart's recorded input/viewport. Large dated series default to
  exchange-day grouping, retaining first, last, extrema and counts. Volume/count series use
  totals. An explicit **Show every observation** option exposes all exact timestamps/values.
  OHLC grouping retains first open, high/low, last close/indicators, and all fills. Grouping never
  changes the plotted data or indicator calculation.
  Table footers also retain session-open, average-cost and portfolio period-start references.
  The recent-hour portfolio view explicitly explains its drawn full-period baseline even when
  that initial observation lies outside the displayed hour; hidden balances redact it too.
- `ChartVoice` reads the existing voice section (`enabled` or the chart-specific preference)
  without overwriting unrelated settings. Settings adds **Read chart summaries aloud**, off by
  default. Focus and Explain use the same summary; speech uses the briefing speed and company
  names. An active speaking switch scanner receives its existing queued announcement instead.
  The shared narrator does not start over another voice and tears down owned speech. Insights
  has its own equivalent stored opt-in because it is a separate application/origin.
- The current description and an open table update with data. A 600 ms debounce coalesces
  updates and cancels obsolete announcements. Period/security/viewport changes are announced
  politely; background price ticks do not make every unfocused chart speak. The original
  portfolio switch-control announcement remains, with one PS-25 screen-reader live region.
- Table-only changes also trigger the polite update notification, including changes to an
  interior observation that leave summary endpoints/extrema unchanged. Repeated updates clear
  the old live-region text before the next announcement. Collapsing an explanation stops its
  owned narration. Context keys include the account, stock and selected window where applicable.
- Switch control uses the unchanged engine from `main`. Chart graphics and table scroll
  regions use its existing `data-scan-ignore` hook while retaining ordinary keyboard access;
  heat maps use its existing group hook so stock buttons stay reachable. The scanner owns
  focus speech. Explicit Explain requests queue through its public announcement API after
  the normal selection confirmation, without changing scanner timing or activation behavior.
  Regression coverage includes Space/Enter selection, continued scanning, saved settings,
  reload and Alt+S off.
- Insights normalizes observations once for the plot, description and table, so unsorted or
  duplicated dated observations and invalid values cannot make the alternatives disagree.
  The SVG has one keyboard focus stop; arrows and Home/End explore actual observations, and
  Escape clears the readout. Point descendants of `role="img"` are decorative pointer targets,
  avoiding focus stops that some screen readers cannot expose. Both report charts share one
  stored speech preference and owned narrator through `InsightsChartVoice`.
- Allocation/exposure alternatives distinguish balances that have not loaded from a genuine
  empty portfolio. Their names stay stable; loaded values and privacy belong in the linked
  descriptions. Stock summaries use the actual selected window, including shorter live windows.
- Portfolio, allocation and exposure alternatives honor hidden balances; private trade
  details and average costs are omitted from chart alternatives. Public stock prices remain
  available. No new network requests, market figures or trading calculations are introduced.
- Exact OHLC tables retain separate recorded bars even when the feed assigns them the same
  closing timestamp, and include each actual fill once. Indicator calculations and rendering
  inputs remain unchanged. The watchlist's sector card grows when its explanation/table opens,
  so the added content does not spill into the next dashboard row.

## Acceptance mapping

| AC | Evidence |
| --- | --- |
| 1 | Inventory above; rendered charts have names, image roles and per-instance linked descriptions. Decorative duplicates are hidden. |
| 2 | Explain exposes the current text and optionally narrates that same description. |
| 3 | Signals/computed values follow period, security, viewport and source data; polite updates are coalesced and stale timers are cancelled. |
| 4 | All figures come from recorded chart inputs, actual holdings/cash or fills. Loading, empty, singleton, zero-baseline and missing-volume cases are explicit. |
| 5 | `chart-description.test.mjs` covers rising, falling, flat, empty, singleton, invalid, zero-baseline, dated extrema and privacy cases. |
| 6 | Native captions, `scope="col"` and `scope="row"`; models retain exact recorded values and all visible fills. |
| 7 | Native persistent buttons have `aria-expanded`/`aria-controls`; browser and component tests verify retained focus. |
| 8 | Large dated data groups by New York day, with stated aggregation and an exact-observation view. Tests verify counts and summed values. |
| 9 | Portfolio, allocation and advanced price have keyboard focus, linked summaries and opt-in speech. Browser tests exercise all three. |

## Validation and manual review

Tests use the existing Node/Angular and Playwright frameworks, without new dependencies:

```powershell
npm test --prefix frontend
npm test --prefix insights-frontend
npm run build --prefix frontend
npm run build --prefix insights-frontend
cd frontend
npx playwright test e2e/chart-access.spec.mjs --trace off
npx playwright test e2e/switch-control.spec.mjs --project=NextTrade --trace off
# Windows: additionally exercise installed speech voices with real timers.
$env:NEXTTRADE_NATIVE_SPEECH = '1'
npx playwright test e2e/switch-control.spec.mjs --project=NextTrade --grep 'native Windows speech' --trace off
Remove-Item Env:NEXTTRADE_NATIVE_SPEECH
npx playwright test e2e/colour-mode.spec.mjs e2e/non-colour-signals.spec.mjs e2e/stock-dashboard.spec.mjs --project=NextTrade --trace off
```

The browser fixtures supply known data and mock speech output; no orders are sent. Checks cover
native table semantics, focus, dynamic security/period changes, missing volume, balance privacy,
actual volume, the existing non-colour cues, forced colours, and speech opt-in.
The optional native Windows checks observe actual speech start/end events without replacing
the speech engine or advancing a fake clock. Both Novice and Advanced completed speech and
advanced the ring with the installed Windows voices on 22 October 2026. The scanner source,
settings, styles and startup match `origin/main` (`8c25538`); chart alternatives remain additive.
If `ng serve` was already running before the main merge added `shared/switch-scan.scss` to
`angular.json`, restart it once so the new global stylesheet enters its build. A stale server
can create the scanner DOM without any visible border. Switch browser checks now assert
fixed positioning, a painted 4px border and viewport intersection, beyond DOM visibility.
After merging that revision, the complete NextTrade unit suite passed 407 tests and its
production build passed with the existing CSS budget warnings. Five chart browser flows,
two switch-selection flows and both native Windows speech flows passed. The selection tests
compare spoken summaries after the existing ticker-to-company-name speech formatting.

Verified on 21 October 2026: both production builds passed; the full suites passed 393 NextTrade
tests and 80 Insights tests; the combined browser run passed 19 applicable tests (the other 19
project combinations intentionally skip). Final reference-footer/security-reset changes passed
18 focused unit tests and all five chart browser flows again. Insights speech opt-in, focus
narration and preference restoration also passed a dedicated browser check. Existing stylesheet
warning budgets remain warnings; no build threshold was changed.

Completion audit on 22 October 2026: both production builds passed again. Full suites passed
401 NextTrade tests and 81 Insights tests. The final OHLC data-parity changes passed 51 focused
checks; the portfolio baseline/privacy change passed all 15 chart interaction/access tests.
Browser regression coverage passed the 23 applicable flows across the chart, colour-mode,
non-colour-signal and stock-dashboard suites after resolving stale assertions. All six chart
flows were repeated on the final build and passed, including both sector locations, stock
selection from the heat map, original volume observations and shared Insights speech settings.
The other project combinations intentionally skip. Expanded market-overview and Insights
screenshots were inspected. Existing CSS-size warnings remain; no thresholds were relaxed.

The audit and acceptance mapping cover the nine Jira criteria. No RSI or standalone sparkline
is rendered, so none is fabricated. Manual assistive-technology verification below is still a
release review, not an automated claim of WCAG conformance.

WCAG 2.2 AA considerations include 1.1.1 (text alternatives), 1.3.1 (relationships), 1.4.1
(non-colour meaning), 1.4.3/1.4.11 (contrast), 1.4.10 (reflow), 2.1.1 (keyboard), 2.4.3/2.4.7/
2.4.11 (focus), 2.5.8 (minimum targets), 4.1.2 (name/role/value) and 4.1.3 (status messages).
Automated tests do not establish full WCAG conformance. Before release, manually review NVDA
with Edge/Firefox and VoiceOver with Safari: focus each chart, read the linked description, open
tables and navigate headers, change periods/securities, switch voice off/on, use the physical
switch device, and check 200%/400% zoom and Windows contrast themes.

References: [W3C complex images](https://www.w3.org/WAI/tutorials/images/complex/),
[W3C data tables](https://www.w3.org/WAI/tutorials/tables/),
[WCAG status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

Sprint 10 audit: keyboard inspection and audio use the displayed series; sector allocation uses the sector ring, with loading guards and hidden-balance masking. Real screen-reader verification remains manual.
