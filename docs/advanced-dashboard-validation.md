# Advanced dashboard validation

Validated October 20, 2026.

## Browser coverage

18 Playwright scenarios pass in desktop Edge, including a mobile viewport layout check. API responses are controlled fixtures: these checks do not place real trades or transfer real account funds.

| Controls | Verified behavior |
| --- | --- |
| Buy/Sell, stock selector, Market/Limit | Side and stock update; limit input appears; estimates use bid/ask |
| 25/50/75/100% sizing, price protection | Correct share counts and updated protection |
| Take profit, Stop loss, price/percentage units | Toggle inputs, convert distances, review and submit both buy and sell limit orders |
| Review, Edit, Close, Confirm | Correct order payload; modal lifecycle; visible rejection and successful retry with the same reference |
| Risk calculator and Apply share quantity | Disabled reasons recover; calculated shares apply; unused invalid budget does not block manual orders |
| Presets | Save, replace, apply, delete, reload persistence and account isolation |
| Activity | Order/cash filters, dates, clear filters, cancel confirmation and cancellation |
| Navigation and chart | Pages, search, notifications, privacy, sidebar, chart periods, keyboard shortcut/Escape and exposure dialog |
| Portfolio and markets | Stock selection, tabs, watchlists, movers, heatmap and filters |
| Settings | Protection presets/custom value, stock overrides, collapse/expand and sign-out |
| Accounts and transfers | Switch, add validation/cancel/close/open; transfer Max, review/back/confirm/done |
| Recovery and notifications | Failed balance retry, market-closed warning, filled-order View/Dismiss |

Tests: `frontend/e2e/advanced-flows.spec.mjs` and `frontend/e2e/advanced-ticket.spec.mjs`.

## Fixes found during testing

- Aligned exit-price input minimums with their step, allowing valid prices through native browser validation.
- Displayed submission errors inside the review dialog.
- Removed native order-form validation from the optional risk budget; the calculator still validates it before enabling Apply.
- Updated obsolete frontend assertions that expected a market-only ticket.

All 261 frontend tests pass. All 28 PostgreSQL order lifecycle tests pass, covering limit waiting/filling, linked profit and stop exits, cancellation, settlement, duplicate protection, stale quotes and concurrent execution. Production build passes with the existing `app.scss` size-budget warning.

Browser fixtures verify controls and request handling, not live service integration. Database lifecycle tests separately verify execution using isolated PostgreSQL schemas. These checks do not guarantee every market condition, device, or service outage is covered.

## Overall portfolio chart

Overview now includes an additional account-value chart above the existing dashboard grid. The stock chart, ticket, summary, positions and other controls remain available.

- Cash plus all holdings for the selected account; independent 1D/1W/1M/3M/1Y/ALL ranges.
- Historical values reconstructed from settled cash activity, filled orders and recorded stock prices. Current values follow the dashboard's bid-based valuation; historical holdings use quote midpoints.
- Value changes explicitly include deposits, withdrawals and transfers and are not labeled investment returns.
- Hover/touch and keyboard inspection, balance privacy, manual refresh, automatic history refresh every minute, and failure/retry states.
- Old account responses cannot overwrite a newly selected account's chart or balances.

Coverage: `frontend/tests/advanced-portfolio.test.mjs`, `frontend/tests/portfolio-history.test.mjs`, the account-switch regression in `frontend/tests/advanced-dashboard.test.mjs`, and `frontend/e2e/advanced-portfolio.spec.mjs`. Browser checks include desktop/mobile layouts and preservation of stock tools.

## Stock chart styles and moving averages

- Line remains the default. Candles and OHLC bars render the backend's stored quote-midpoint open/high/low/close values, with green/red direction and OHLC hover details. These are simulated quote prices, not exchange trade candles.
- Choose 1m, 5m, 15m, 1h or 1d bars. Candle/indicator data refreshes every five seconds and resets on stock, interval or time-range changes. Failed refreshes show a warning and Retry button.
- SMA and EMA independently toggle on/off and accept whole-number periods from 2 through 200. EMA starts with a full-period SMA seed. The current incomplete bar is included, so indicators can change while that bar develops. Line mode with indicators uses the same selected bars for timestamp alignment.
- Requests retrieve at most 500 recent intervals. Empty ranges and insufficient history are explained, without synthetic filler values. Select a longer bar interval for longer time ranges. No volume or VWAP data is fabricated.
- Portfolio performance, RSI/MACD, Bollinger Bands, and additional order-level overlays are not part of this stage.

Calculation/transport tests: `stock-indicators.test.mjs`, `candle-api.test.mjs`. Browser scenarios: `stock-chart-styles.spec.mjs`, `stock-chart-hover.spec.mjs`.

## Branch validation ? October 21, 2026

- Trading frontend: all 270 unit/component tests pass; production build succeeds with the existing `app.scss` size-budget warning.
- Orders: all 372 tests pass, including all 28 PostgreSQL lifecycle tests in isolated schemas.
- Quote pipeline: all 15 quote-ingestion and continuity tests pass.
- Holdings: the full suite runs 232 tests, with one failure and 28 skipped. The changed order-history repository tests pass. `ApiSecurityTest.unexpectedErrorsDoNotLogUnlabelledSecrets` fails because Spring DEBUG logging includes the exception canary; the failing test and logging code are outside these advanced-dashboard changes.
- Browser: all 22 advanced dashboard scenarios pass in headless Edge, including portfolio, sidebar resizing, hover, candles, and indicators.
