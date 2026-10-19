# NextTrade Internal Insights

Internal reporting and operations UI for Priya (commercial analyst) and David (head of trading operations). Branding matches the main dashboard: the NextTrade wordmark with green Trade and the NT symbol, Inter headings and UI text, charcoal backgrounds, 8px panels, neutral borders and the same green primary buttons. A small Insights / Internal label and reporting-specific layout distinguish the internal workspace. IBM Plex Mono is reserved for identifiers and compact metadata.

## Run

Use Node 24.15+:

```powershell
npm ci --prefix ../shared/session-core
npm run build --prefix ../shared/session-core
npm ci
npm start
```

Open http://localhost:4301. Start `docker compose up --build -d gateway` from the repository root first for API access. The development proxy forwards `/auth/` and reporting API requests to the gateway on port 4201. The Docker client remains at http://localhost:4201; its container serves static files only. Production: `npm run build`. Tests: `npm test`.

## Pages and who can see them

| Page | Route | Analyst | Operations | Data |
| --- | --- | --- | --- | --- |
| Insights | `/insights` | ✓ | ✓ | Live totals (`/reports/summary`), trades by hour today and top traded today (`/reports/insights/*`) |
| Clients | `/clients` | ✓ | ✓ | Empty state until TS-18.5 builds the account list and detail. Names and emails are never shown |
| Reports | `/reports` | ✓ | ✓ | Instrument, client segment and trading activity CSVs for a UTC date range (`/reports/generate/*`, TS-18.6) |
| Trade lookup | `/trades`, `/trades/:orderId` | | ✓ | Every recorded step of one trade, its outcome and record checks (`/trades/{id}/events`, BR-15) |

Operations staff see everything analysts see, plus the trade lookup. Signing in lands both roles on
Insights; opening a page your role cannot see sends you there too. Traders and any other role get
"Please use an analyst or operations account" and keep no session. Pages cut in TS-18.4
(`/dashboard`, `/history`, `/trading-activity`, `/client-activity`, `/orders`, `/trade-investigation`,
`/compliance`, `/settings`) redirect to `/insights`.

Nothing is sample data: every figure comes from the insights service. Report CSVs are still built from
`insights/src/main/resources/reports/trades.csv` until NEXT-252 moves them to the database.

## Structure

- `shell/`: sidebar, top bar and sign-out around every page; the nav comes from `roles.ts`.
- `pages/<page>/`: one standalone component, template and stylesheet per route.
- `shared/`: the icon, chart, KPI tile, page heading and `workspace.scss` (panels, tables, badges and
  tabs used by every page, loaded from `styles.scss` and scoped to the shell).
- `roles.ts`: which pages each role sees and the route guard; `page-state.ts`: safe return URLs after sign-in.

## Boundaries

Sign-in uses the existing Identity service and admits ANALYST and OPERATIONS accounts. The role comes
from the token; the page never chooses it. Access tokens stay in memory; the rotated refresh token and
last activity time use a separate `sessionStorage` key for this app. Reload restores the session before
rendering a protected page, without extending its ten-minute idle deadline.

## Visual consistency

Core palette and panel tokens are in `src/styles.scss`, matched to `frontend/src/app/novice-dashboard.scss`. The NT symbol reuses the main app's brand SVG. When changing the main brand, keep these values aligned; the apps remain independently buildable without importing source outside their build contexts. The internal app uses a wider sidebar to accommodate operations navigation and blue-gray metadata as its secondary accent.

## Validation

`npm run test:coverage` runs the unit tests in `tests/` (see `tests/README.md`) and fails any file
with no coverage. A production build (`npm run build`) checks templates and types.

## Local development files

Generated JavaScript belongs in `out-tsc/`, not `src/`. For a check without emitting files, run `npx ngc -p tsconfig.app.json --noEmit`. Dependencies in `node_modules/` are retained for local development; build output and caches can be regenerated.

## Session and URL restoration (NEXT-220)

Protected routes are `/insights`, `/clients`, `/reports`, `/trades` and `/trades/:orderId`. After
signing in, a user returns to the page they asked for if it is one of those; anything else opens
Insights. Report export history resets on reload.

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
