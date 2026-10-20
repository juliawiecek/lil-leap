# NextTrade Angular

Angular conversion of the approved NextTrade animated landing and authentication experience.

## Included

- Animated candlestick intro rendered with the Canvas API
- Moving market ticker and ambient volume animation
- NextTrade brand reveal and transition into the access screen
- Sign In and Create Account modes
- Password visibility, form validation, and a password recovery placeholder
- Responsive desktop and mobile styling
- Reduced-motion support

## Technology

- Angular 22 standalone component
- TypeScript
- SCSS
- Angular signals for interface state
- Native Canvas API for the chart animation

## Run locally

Install **Node.js 24.15.0 or a later 24.x release** (includes npm), then clone
this repository. From the project folder (`lil-leap`):

```powershell
npm ci --prefix shared/session-core
npm run build --prefix shared/session-core
cd frontend
npm ci
npm start
```

Open **http://localhost:4300** after the build finishes.
Keep the terminal open. Press **Ctrl+C** to stop the app.
On later runs, run `npm start` from `frontend`.
Run `npm ci` again if you pull changes to `package-lock.json`.

### Signing in (auth service)

Sign up, sign in, and sign out call the auth service at relative `/auth/...`
paths. Start the stack from the repository root with `docker compose up --build -d gateway`.
`npm start` forwards API requests to the shared gateway at `http://localhost:4200`
through `proxy.conf.json`. In Docker, the shared gateway routes `/auth/` to Identity. Both keep
requests same-origin, so no CORS setup is needed. Never call the auth
service by absolute URL.

Access tokens stay in memory. The rotated refresh token and last user-input time
are stored in `sessionStorage` for this tab. Startup exchanges that token before
opening protected pages; a failed or idle-expired session opens login. Closing
the tab removes its recoverable session. Reloading never resets the ten-minute
inactivity deadline (BR-03; keep `SESSION_INACTIVITY_MINUTES` in step with Identity).

Pages use Angular routes: `/dashboard`, `/orders`, `/history`, `/settings`,
`/watchlist`, `/portfolio`, and the tier-specific `/learn`, `/markets`, `/screeners`.
Search, chart/panel choices and history filters are URL parameters, so reload and
Back/Forward restore them. API data reloads from the server; order drafts do not.
Both nginx clients already fall back to `index.html` for deep links.

Browser regression checks run with `npm run test:e2e` after building both apps.
The default test server serves the production builds on ports 18080/18081 with
SPA fallback. Identity and trading responses are mocked with rotating tokens;
these checks do not claim to exercise a live Identity database. To use separately
served builds, set `NEXT220_TRADING_URL` and `NEXT220_INSIGHTS_URL`. Windows uses
installed Edge; other systems need Playwright Chromium (`npx playwright install chromium`).

### Common problems

- **Missing `package.json`:** run npm commands inside `frontend`.
- **Connection refused:** check that `npm start` is still running.
- **Port already in use:** stop the previous server with **Ctrl+C**.

For backend startup, follow the [setup guide](../docs/GETTING_STARTED.md).

## Portfolio day-chart readability

The portfolio-value chart renders its emerald area, complete line and endpoint together in one
SVG, with no initial dash/reveal animation or separate HTML dot. The marker stays
attached during live updates and responsive resizing. Invalid observations are
excluded from rendering without modifying the source history.

For a day with enough recorded history, **1D** opens on **Recent hour** detail.
Use **Full day** to see the entire session. Both views retain actual timestamps;
changing the visible window does not change the day's performance calculation or
remove stored history. The plot has additional edge padding and a taller mobile
layout to keep the trend readable. Viewport transitions use native animation frames
outside Angular, with reduced-motion support and complete teardown cleanup.

## Custom one-day stock chart

The advanced trading overview uses `StockDashboardComponent` with our standalone
`StockSvgChart`. The renderer uses Angular, RxJS, TypeScript and native SVG only;
there are no charting or visualization dependencies. The novice overview shows its
portfolio chart without a separate stock explorer. The existing long-range
trade-history chart remains available in the advanced view.

```html
<app-retail-stock-dashboard [selectedAsset]="asset" [sampleMs]="5000" />
```

`sampleMs` accepts **5000** (default) or **10000**. Sampling uses RxJS
`sampleTime` on the chart branch and keeps the latest real quote from each period.
The existing market feed and other raw-stream subscribers retain their live cadence.
Changing the interval preserves chart history and does not restart the producer.
Select a stock with `{ symbol, name, market }`, or inject an authenticated
`Observable<StockDashboardTick>` using `STOCK_DASHBOARD_TICKS`. The exported
`provideStockDashboardFeed(asset)` supplies a shared, cancellable REST adapter.
All requests use the existing authenticated `QuoteService`/`ApiHttpClient`.

The adapter loads available history (the existing endpoint returns at most 1,000
recent quotes), filters to the quote's New York trading date and preserves backend
timestamp precision. It refreshes history on a new trading date. It cannot recover
older quotes outside that API limit. The default **1D** view fits the available
history within that day once, then scrolls left at that fixed span as new prices
arrive. It does not stretch old prices to make room. `windowSeconds` optionally selects a fixed scrolling span
between 2 and 86,400 seconds.

Performance uses `/api/v1/quotes/day-opens`, independently of chart samples or the
history page. This backend returns the first regular-session midpoint (or a prior
close before the session); the chart rejects prior-session fallback values. Once
received, the session baseline survives temporary opening-price request failures.
This is the application's existing session reference, not an external exchange's
official auction price. Synthetic prices retain their simulated-data label.
Performance metrics retain their actual green/red session comparisons and show an
unknown state when the baseline is missing. The chart itself always uses an emerald
`#22c55e` 2px stroke, rounded caps and joins, and an SVG area filled from
`rgba(34, 197, 94, 0.4)` to `rgba(34, 197, 94, 0.0)`.
Both main chart renderers use `gradientUnits="userSpaceOnUse"`, anchored from the
fixed plot top to its bottom. Only path coordinates and viewport clipping move;
horizontal scrolling never translates or restarts the gradient.

`stock-chart-math.ts` contains pure coordinate, path, normalization, selection and
pixel-reduction functions. First/last/min/max points per pixel bucket retain highs,
lows and trend without changing the original data. Custom monotone cubic segments
pass through real observations, with control points bounded by their segment
endpoints so they cannot create artificial price spikes. `StockChartViewport` animates time/price domains and
reveals incoming segments over 240ms with `requestAnimationFrame`. Reduced-motion
users receive immediate updates. The SVG nodes are created once by Angular; only
path/coordinate attributes change during animations, outside `NgZone`.

Hover, touch, and left/right/Home/End keys inspect actual prices and timestamps.
Inspection freezes the view while new samples remain buffered; leaving, releasing
touch, blurring, or pressing Escape smoothly resumes it. A ResizeObserver redraws
at the new size without discarding prices. Subscriptions, listeners, observers and
animation frames are cleaned up at teardown. Empty/loading/error states and stale
quote warnings retain the existing dashboard design.

The smaller `RealtimeStockChart` wrapper also uses this SVG renderer. Provide
`STOCK_PRICE_TICKS` with `{ time, price }` timestamps in Unix seconds (including
fractional seconds), and pass `[history]`, `[openingPrice]`, `[sampleMs]` and
`[windowSeconds]` as needed. Always use the quote's backend `quotedAt` timestamp,
not the client receipt time. Existing `openingPrice` integrations remain compatible;
the rendering theme is independent of performance.

## Production build

```powershell
npm run build
```

The compiled site is written to `dist/nexttrade-angular/browser`.

## Run with Docker

The shared gateway publishes the trading client at `http://localhost:4200`:

```bash
docker compose up --build -d gateway
```

The frontend container serves static files on internal port 80. The gateway routes
authentication to Identity, portfolio and instrument reads to Holdings, order
submission to Orders, and quote requests to Quotes. `GET /api/v1/orders` belongs
to Holdings; `POST /api/v1/orders` belongs to Orders. Paths are preserved.
See the [route table](../docs/architecture/service-boundaries.md#gateway-routes).

## Main files

- `src/app/app.html`: Angular template
- `src/app/app.scss`: visual design and animations
- `src/app/app.ts`: Angular state, interactions, and chart rendering

Registration, login, token refresh and logout use the real Identity service. The novice and advanced dashboards load order history from `GET /api/v1/clients/{id}/orders` through the gateway to Holdings, with date and status filters and the current bearer token. Order submission, portfolio reads and quote polling use the existing trading APIs. Some overview and market views still contain illustrative data.

## Error logging

Bootstrap and Angular/global runtime errors log fixed event messages, never raw
errors, stacks, HTTP payloads, or form data.

Run `npm test` (Node 24+, or Node 22.18+) for application startup and secret-bearing
error tests, then `npm run build` for the production compilation check.

Deploy `dist/nexttrade-angular/browser` on a static host. The development server
is not a production host. Keep static-host/proxy access logs free of query strings,
cookies, Authorization headers, and request/response bodies.

Future API integration must not log credentials or store tokens in URLs.
Backend logging setup is in [the orders backend README](../nextTrade-orders/README.md).

## Shared session package

Before installing either app, run `npm ci --prefix shared/session-core` and
`npm run build --prefix shared/session-core` from the repository root. Then run
`npm ci` in each app. Rebuild the shared package and reinstall the consumers
after changing shared sources. Local file dependencies are installed as copies
so the apps use their own Angular runtime. The shared package owns auth/session
behavior and contract tests; each app provides its role, storage key and routes.

Docker builds use the repository root as their context: `docker build -f frontend/Dockerfile .`. Compose and Jenkins prepare the shared package automatically.

## Real Identity browser tests (NEXT-157)

Run `npm run test:e2e:auth` from this directory for the 13 real registration/login
cases covering both apps. Requires Node 24 and a running Docker daemon with
Compose v2; dependencies and Chromium are installed inside the pinned container.

From the repository root, run `npm --prefix e2e ci` and
`npm --prefix e2e run test:stack` with Docker Compose v2 running. This suite builds
both apps and the production NestJS Identity service with isolated PostgreSQL.
It tests NextTrade registration and valid/invalid login in both apps. Insights
analysts are created through the real Identity API. See the
[root test guide](../README.md#real-stack-browser-tests-next-157-next-164-next-163).
The separate NEXT-220 session suite uses mocked APIs and is not the real-service
acceptance check. Build the shared session package before installing either app.
