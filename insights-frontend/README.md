# NextTrade Internal Insights

Internal reporting and operations UI for Priya and David. Reporting layouts follow the supplied renderings. Branding matches the main dashboard: the NextTrade wordmark with green Trade and the NT symbol, Inter headings and UI text, charcoal backgrounds, 8px panels, neutral borders and the same green primary buttons. A small Insights / Internal label and reporting-specific layout distinguish the internal workspace. IBM Plex Mono is reserved for identifiers and compact metadata.

## Run

Use Node 24.15+:

```powershell
npm ci
npm start -- --port 4201
```

Open http://localhost:4201. Production: `npm run build`. Data checks: `node --test tests/insights-data.test.mjs`.

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

This is a design preview with product-facing UI copy, not an authenticated internal production app. The persona switch only previews UI; it must be replaced by server-enforced roles before use with real records. No real client data or credentials are requested.

Fixtures in `src/app/insights-data.ts` contain August/September 2026 sample orders and a September 22 snapshot. Reports and volume charts derive from those orders. Client balance snapshots are separate illustrative values, not reconstructed from that limited order sample. Volume is filled notional in USD. Activity definitions and USD segment thresholds are provisional; the current definitions are displayed in the UI.

Backend integration is still needed for reporting snapshots/freshness, identity and permissions, authoritative client balances, complete audit events, compliance cases, scheduled jobs and durable report history. No PDF export, emails, document uploads, case edits, trade mutations or live surveillance is simulated as complete. Static persona selection does not provide authorization. Report CSV files include the report name and period; their data still comes from local fixtures. Exports reset on reload.

The copied investor-profile, stock-dashboard, standalone login prototype and their obsolete notes have been removed. Only internal workspace components remain. Unused router dependency, icon paths and font weights/families have been removed; RxJS remains an Angular peer dependency. Local browser previews and npm caches are excluded from both Git and Docker builds.

## Visual consistency

Core palette and panel tokens are in `src/styles.scss`, matched to `frontend/src/app/novice-dashboard.scss`. The NT symbol reuses the main app's brand SVG. When changing the main brand, keep these values aligned; the apps remain independently buildable without importing source outside their build contexts. The internal app uses a wider sidebar to accommodate operations navigation and blue-gray metadata as its secondary accent.

## Validation

The data tests check aggregate reconciliation across chart groupings and asset classes, intersecting/inclusive filters, empty results, fixture chronology and CSV escaping/formula protection. A production build checks Angular template and type integration. Daily refresh and report-generation service performance require later integration tests.

Verified for this implementation: production build passed; all four data tests passed. Headless Chrome checks covered all eight sections at desktop and 390px widths, client/order selection, asset filtering, invalid dates and the report-generation UI. No application runtime exceptions were observed. Production authentication, backend APIs and scheduled jobs were not tested because they are not connected.

## Local development files

Generated JavaScript belongs in `out-tsc/`, not `src/`. For a check without emitting files, run `npx ngc -p tsconfig.app.json --noEmit`. Dependencies in `node_modules/` are retained for local development; build output and caches can be regenerated.
