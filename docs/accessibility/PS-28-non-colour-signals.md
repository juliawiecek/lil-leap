# NEXT-248 / PS-28 — Never rely on colour alone

[Jira story](https://lilleap.atlassian.net/browse/NEXT-248), bundles COLOR-3, COLOR-4 and COLOR-5. Builds on the committed PS-27 colour tokens and PS-17 Settings preferences.

## Repository findings and scope

The current branch has native SVG charts, not a third-party chart library. The advanced history panel previously plotted closing prices and trade markers; its old indicator/volume styles were unused. The exposure visualization is now a split bar rather than the ring described in Jira. Both that visualization and the allocation donut are covered.

The Holdings `PriceCandle` response contains time and OHLC midpoint quote prices, **without traded volume**. This change preserves that backend API. It retains the actual OHLC metadata already returned to the frontend instead of discarding it, and uses existing requests and live ticks. Volume is never inferred from quote counts, client order quantities, or an invented constant.

Consequently, real-data EMA 50/200 and hollow/filled candles can render now. **Production volume and VWAP cannot render until a provider supplies traded volume.** The interface explains their unavailability. Optional reported-volume rendering, hatching and dotted VWAP are implemented and exercised using explicitly volume-bearing test fixtures; those fixtures do not represent a capability of the current backend.

## Shared components and implementation

- `financial-change.ts`: shared signs, direction triangles, neutral zeroes, Angular locale/currency precision and screen-reader descriptions. Visual symbols are hidden from assistive technology; financial updates do not introduce live regions. Applied to both dashboards, returns, holdings, positions, market movers, sectors, watchlists, ticker, stock performance and activity amounts. Private novice balances remain masked.
- `price-flash.ts`: reserves a fixed-width cue slot, follows the feed's existing version key, and uses the existing flash duration without extra timers/subscriptions. Arrows briefly appear for updates in every palette. Reduced motion shows a static cue. The duplicated ticker tape remains hidden from assistive technology.
- `status-badge.ts`: shared presentation mapping for Filled, Rejected, Cancelled, Pending, Submitted, Accepted, Delayed, Settled, Completed, Open and Closed. Symbols are decorative beside readable words. Activity badges and notifications reuse it; existing market badges retain explicit status words.
- `technical-chart-math.ts`: real-period SMA seeds for EMA, reported-volume-only bar VWAP, display-only OHLC aggregation preserving highs/lows, and bounded endpoint-label collision avoidance. Indicator calculations use the full recorded input, not the reduced display candles.
- `technical-chart.ts/html/scss`: native SVG candles, visible wicks, solid/dashed/dotted indicator paths and legends, endpoint labels with connecting leaders, price/time scales, existing trade markers and average-cost reference, pointer/keyboard inspection, responsive sizing, viewport controls and observer cleanup. Pan anchors remain fixed during incoming updates. Missing history and missing volume have explicit explanations.
- `market-feed-api.ts` / `advanced-dashboard.ts`: preserve valid existing OHLC metadata and update open-bar extrema from observed live prices. Existing prices, timestamps, request routes, account calculations and order processing remain unchanged. Missing live volume stays unknown.
- `accessibility-visuals.scss` and `theme-tokens.css`: matching allocation segment/legend hatching and outlines, exposure patterns, landing-candle conventions, forced-colours system tokens, and preference-only stronger borders/focus. The normal PS-27 palettes and cash greys remain intact. No blanket `forced-color-adjust: none` is used.
- `theme-colours.ts`: Canvas resolves system colours and responds to contrast-preference changes as well as palette changes; media listeners and the root observer are removed together.

## Acceptance evidence

| # | Acceptance criterion | Implementation and validation |
| --- | --- | --- |
| 1 | Directional changes | Reusable formatter provides ▲ +, ▼ −, and neutral —; tests cover zero, negative zero, missing values, precision, currency and speech. Browser checks exercise all palettes. |
| 2 | Explicit statuses | Status mapping supplies words and decorative symbols; market badges say Open/Closed or unavailable. No backend status is changed. |
| 3 | Ticker arrows | Real feed-refresh tests check both directions, constant cue width, reduced motion and no live announcements. |
| 4 | Grayscale meaning | Signs, words, candle shapes, dashes, matched allocation patterns and labelled exposure segments are independent of hue; grayscale screenshots are reviewed. |
| 5 | Hollow/filled candles | Up is hollow, down filled, flat horizontal, with visible wicks in all palettes. Landing SVG/Canvas candles use the same convention. Volume has outlines/hatching when reported. |
| 6 | Indicator styles and labels | EMA 50 solid, EMA 200 dashed, VWAP dotted; legend and visible endpoint labels, with collision avoidance. Tests cover pan/zoom/resize. **Production VWAP remains blocked by absent traded volume**, not a missing renderer. |
| 7 | Allocation/exposure | The novice sector ring pairs slice labels/patterns with its legend; cash stays solid in the separate exposure split. The exposure split bar and legend match patterns. Names, amounts, proportions and percentages remain available. |
| 8 | Chart simulations | Browser checks and screenshots cover grayscale, protanopia, deuteranopia and tritanopia in all three palettes. Simulations do not replace testing with affected users. |
| 9 | Windows High Contrast | Dedicated forced-colours rules use system text, background, control, disabled and focus colours; SVG patterns/shapes preserve meaning. Representative Edge forced-colours checks are used; real OS/assistive-technology review remains manual. |
| 10 | Increased contrast | Preference-only stronger card/control boundaries, focus outlines and chart strokes, retaining layout and the existing palettes. |

## Verification and limits

Run the existing project frameworks:

```powershell
npm run build --prefix frontend
node --test --test-concurrency=1 frontend/tests/*.test.mjs
cd frontend
npx playwright test e2e/non-colour-signals.spec.mjs e2e/colour-mode.spec.mjs e2e/buy-button.spec.mjs e2e/stock-dashboard.spec.mjs --project=NextTrade --trace off
```

The package defines no lint command. Angular compilation and the existing source-colour audit check the new code. No dependencies, backend APIs, trading calculations or build/coverage thresholds are changed. Existing stylesheet-size warning budgets remain below their error budgets.

Automated checks cannot establish complete WCAG conformance. Human screen-reader and physical switch-device checks, real Windows contrast-theme testing, and testing with users with colour-vision deficiencies remain necessary. The original Off-mode text-contrast exceptions recorded in PS-27 are not silently redesigned here; increased-contrast preferences improve the dim labels when enabled.

Reference guidance: [WCAG 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), [CSS contrast preferences](https://www.w3.org/TR/mediaqueries-5/), and [system colours](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/system-color).

## Defects found and corrected in review

Seven regressions introduced while adding the cues above were fixed after the fact.

| Area | Defect | Correction |
| --- | --- | --- |
| Novice market status | Prefixing `marketStatusText` with Open/Closed produced "Closed · Market closed · Opens Mon 8:30 AM CT", because the far-off wording already names the state. | `marketStatusLabel` adds the word only when the detail text lacks it; `marketText` keeps its existing contract for the tests that assert it. |
| `FinancialChange` | A value quoted with its percentage rendered two triangles and two signs — "▲ +$12.34 (▲ +1.23%)" — and spoke the verb twice. | `describeChange(…, arrow)` drops the triangle for the bracketed figure and shortens its speech; the sign is kept so direction survives in grayscale. |
| Novice day summary | The prose clause became "You're ▲ +$12.34 today" and spoke "You're Increased by 12.34 USD today". | The sentence keeps the existing `moveText` wording with a decorative `moveArrow`; the bracketed best-mover figure still uses the component. |
| Exposure legend | Legend swatches were painted `--gain` / `--chart-cash` while the bar segments use the dashboard's own neutral tones, so the key contradicted the bar. | Swatches take `--text-tone-05` / `--surface-tone-23`, matching `advanced-dashboard.flat.scss`. |
| Allocation donut | The hatch overlay had no transition while `.ring.stocks` eases over 400 ms, so the pattern jumped ahead of the arc it covers. | `.allocation-pattern` shares the easing, with a reduced-motion opt-out. |
| Landing candles | `drawMorph` chose hollow/filled from the SVG target while `drawCandle` used the seeded walk, flipping roughly half the bodies on the first morph frame. | The convention changes with the geometry at the morph midpoint. |
| `readThemeRgb` | The forced-colours probe reached for the global `document`, ignoring the `root` the module otherwise threads through. | The probe uses the root's own document.

Verified by `npm test` (321 passing, 2 added) plus `npx playwright test e2e/non-colour-signals.spec.mjs e2e/colour-mode.spec.mjs e2e/stock-dashboard.spec.mjs e2e/buy-button.spec.mjs --project=NextTrade` (16 passing) and `npm run build`.
