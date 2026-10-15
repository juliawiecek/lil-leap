ï»¿# NextTrade Internal Insights

Internal reporting and operations UI for Priya and David. Reporting layouts follow the supplied renderings. Branding matches the main dashboard: the NextTrade wordmark with green Trade and the NT symbol, Inter headings and UI text, charcoal backgrounds, 8px panels, neutral borders and the same green primary buttons. A small Insights / Internal label and reporting-specific layout distinguish the internal workspace. IBM Plex Mono is reserved for identifiers and compact metadata.

## Run

Use Node 24.15+:

```powershell
npm ci --prefix ../shared/session-core
npm run build --prefix ../shared/session-core
npm ci
npm start
```

Open http://localhost:4301. Start `docker compose up --build -d gateway` from the repository root first for API access. The development proxy forwards `/auth/` and reporting API requests to the gateway on port 4201. The Docker client remains at http://localhost:4201; its container serves static files only. Production: `npm run build`. Data checks: `node --test tests/insights-data.test.mjs`.

## Implemented preview

- Overview: reconciled sample volume, orders, active clients, asset mix and instrument ranking.
- Trading Activity: date, asset, market and portfolio-segment filters, daily/weekly/monthly/yearly chart grouping and status counts.
- Client Activity: segment comparisons, new clients, active/occasional/dormant counts and definitions.
- Clients: searchable fictional directory, profile snapshot and order history.
- Reports: real client-side sample CSV generation/download and session export history.
- Trade Investigation: operations persona preview, search, status filtering and order detail. Missing audit events are explicitly identified rather than invented.
- Compliance: read-only source requirements and unconnected case-service state.
- Settings: preview persona and compact-table preference.

## Boundaries

Sign-in uses the existing Identity service and requires an ANALYST account.
Access tokens stay in memory; the rotated refresh token and last activity time
use a separate `sessionStorage` key for this app. Reload restores the session
before rendering a protected page, without extending its ten-minute idle deadline.
The Analyst/Operations selector previews sample-data views; it does not change
the authenticated role or grant backend permissions.

Fixtures in `src/app/insights-data.ts` contain August/September 2026 sample orders and a September 22 snapshot. Reports and volume charts derive from those orders. Client balance snapshots are separate illustrative values, not reconstructed from that limited order sample. Volume is filled notional in USD. Activity definitions and USD segment thresholds are provisional; the current definitions are displayed in the UI.

Backend integration is still needed for reporting snapshots/freshness, record-level permissions, authoritative client balances, complete audit events, compliance cases, scheduled jobs and durable report history. No PDF export, emails, document uploads, case edits, trade mutations or live surveillance is simulated as complete. Static persona selection does not provide authorization. Report CSV files include the report name and period; their data still comes from local fixtures. Exports reset on reload.

The copied investor-profile, stock-dashboard, standalone login prototype and their obsolete notes have been removed. Only internal workspace components remain. Angular Router provides guarded navigation; RxJS remains an Angular peer dependency. Local browser previews and npm caches are excluded from both Git and Docker builds.

## Visual consistency

Core palette and panel tokens are in `src/styles.scss`, matched to `frontend/src/app/novice-dashboard.scss`. The NT symbol reuses the main app's brand SVG. When changing the main brand, keep these values aligned; the apps remain independently buildable without importing source outside their build contexts. The internal app uses a wider sidebar to accommodate operations navigation and blue-gray metadata as its secondary accent.

## Validation

The data tests check aggregate reconciliation across chart groupings and asset classes, intersecting/inclusive filters, empty results, fixture chronology and CSV escaping/formula protection. A production build checks Angular template and type integration. Daily refresh and report-generation service performance require later integration tests.

Historical UI-preview verification (before NEXT-193): production build passed; all four data tests passed. Headless Chrome checks covered all eight sections at desktop and 390px widths, client/order selection, asset filtering, invalid dates and the report-generation UI. No application runtime exceptions were observed. Production authentication, backend APIs and scheduled jobs were not tested because they are not connected.

## Local development files

Generated JavaScript belongs in `out-tsc/`, not `src/`. For a check without emitting files, run `npx ngc -p tsconfig.app.json --noEmit`. Dependencies in `node_modules/` are retained for local development; build output and caches can be regenerated.

## Session and URL restoration (NEXT-220)

Protected routes are `/dashboard`, `/history` (Trading Activity), `/orders`
(Trade Investigation), `/client-activity`, `/clients`, `/reports`, `/compliance`,
and `/settings`. Existing client/trade details use `/clients/:id` and `/orders/:id`.
Dates, search, filters, grouping, tabs, preview workspace and compact display are
URL parameters. Missing record IDs show an unavailable-record notice rather than
opening another record. Report export history still resets on reload.

Both apps' browser checks live in `../frontend/e2e`; build both apps and run
`npm run test:e2e` from `frontend`. Shared-package tests own the auth/session
contracts; each app tests its adapters and routes.

## Shared session package

Before installing either app, run `npm ci --prefix shared/session-core` and
`npm run build --prefix shared/session-core` from the repository root. Then run
`npm ci` in each app. Rebuild the shared package and reinstall the consumers
after changing shared sources. Local file dependencies are installed as copies
so the apps use their own Angular runtime. The shared package owns auth/session
behavior and contract tests; each app provides its role, storage key and routes.

Docker builds use the repository root as their context: `docker build -f insights-frontend/Dockerfile .`. Compose and Jenkins prepare the shared package automatically.

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
