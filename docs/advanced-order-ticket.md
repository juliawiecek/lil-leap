# Advanced order ticket

This feature extends only the advanced dashboard, retaining main's dashboard, charts, accessibility themes and authentication. The novice ticket remains unchanged.

The ticket supports market and limit buys/sells, executable bid/ask estimates, percentage sizing, optional take-profit/stop-loss exits, risk-based sizing, and reusable account presets. Review shows the actual order terms. Applying a preset never places an order; limit prices reset to the current quote instead of carrying a price from another stock.

## Persistence and permissions

GET, PUT and DELETE `/api/v1/orders/presets?accountId=<uuid>` require an authenticated trader. PUT accepts name, orderType, quantity, tolerance, profitPercent, stopPercent and riskBudget. DELETE additionally takes `name`. Each response is the account's current preset list. Every operation verifies account ownership. Writes lock the account row, enforce a maximum of ten presets and replace a matching name atomically. Data is stored in `account_order_presets`, not browser storage. Existing browser-only presets from the cleanup branch are not automatically uploaded.

## Deployment

`db/startup-migrations.sql` now includes the repeatable advanced-order migration (016) and account-preset migration (019), along with existing startup upgrades. The existing Compose migration dependency applies these before dependent services start, including existing volumes. Run the same startup migration script as the database owner when starting services manually. No database reset is required. `finalized-schema.sql` includes both features for new installations. Gateway and frontend development proxy routes include the new endpoints.

## Execution behavior

Limit orders wait for an executable ask at/below a buy limit or bid at/above a sell limit. Waiting for a price does not exhaust the infrastructure retry budget. After an entry fills, an optional single opposite-side conditional order implements either take-profit or stop-loss. It is created atomically with the fill and cannot close twice. It still needs available cash/shares; existing trading eligibility checks apply. Stop-loss prices are triggers, not guaranteed fill prices. Risk sizing is an estimate and does not guarantee a maximum loss.

## Validation

Order-service tests cover limit fills, waits, exit execution, idempotency and cancellation against PostgreSQL. Preset tests cover persistence across authenticated requests, ownership isolation, invalid values and concurrent saves at capacity. UI tests cover request payloads, risk sizing, account changes, stale responses and failed saves. The browser test exercises desktop/mobile review and retrieves a preset from a new browser context (mocked transport); the backend persistence tests use real PostgreSQL. Migration tests verify fresh and older schemas and preservation of saved presets on repeat startup.
