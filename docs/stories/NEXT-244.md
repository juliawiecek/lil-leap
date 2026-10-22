# NEXT-244 / PS-24 — chart data integrity

## Inspection and NEXT-217 overlap (before implementation)

NEXT-217 / PS-06 is Done in Jira and assigned to Tanush Kaushik (checked 22 October
2026). Its dashboard totals, shared MarketFeed polling, bid-based position valuation,
cash/order refreshes, sector averages and allocation bindings are already present.
`makePath` and the original fixed indicator/volume labels are no longer present in
the trading dashboards. Preserve that work; do not create another portfolio or
quote polling service. No message has been sent to the owner.

Shared files requiring coordination if PS-06 is reopened: `novice-dashboard.ts`,
`advanced-dashboard.ts`, `portfolio-api.ts`, and `market-feed-api.ts`. PS-24 changes
history integrity, allocation availability, request ordering and chart adapters in
these files. PS-06's trading/account actions and live bid valuation remain in use.
Any later portfolio totals/refresh changes should retain the chart availability
checks and stale-account request guards added here.

## Existing sources and gaps

* `/api/v1/quotes/history/{instrumentId}?limit=1000`: Holdings, newest first,
  quote timestamp, bid, ask, midpoint, source and synthetic flag; limit is capped
  at 1000. This is persisted application market data, currently produced by the
  existing synthetic quote engine, not external exchange trades.
* `/api/v1/quotes/candles/{instrumentId}?interval=1m&limit=120`: Holdings,
  oldest first, midpoint OHLC grouped by fixed UTC intervals. Supports 1m, 5m,
  15m, 1h, 1d; at most 500 intervals. No volume or exact close-observation time.
* `/api/v1/quotes/day-opens?ids=...`: session baseline, New York/DST aware.
* `/api/v1/clients/{userId}/orders?accountId=...`: executed quantity, price and
  timestamp from fills; open/rejected/cancelled orders do not change positions.
* `/api/v1/accounts/cash-activity?accountId=...`: deposits and transfer legs.
  Trading cash must also be reconstructed from fills; do not count fills twice.
* `/api/v1/holdings?accountId=...` and `/api/v1/cash?accountId=...`: current
  snapshot used to reconcile the reconstructed ledger and value allocations.

Portfolio history currently uses a future candle when an earlier price is absent,
falls back to execution prices, and applies today's bid/midpoint ratio to historical
midpoints. These are not historical bid observations. Raw bid history is needed for
the recent period, with bid OHLC closes for longer periods. Missing ledger activity
or prices must be reported, not inferred from current holdings.

EMA is already SMA-seeded from recorded bars. VWAP/volume explicitly report missing
feed volume, and RSI is absent. Add Wilder RSI without treating quote counts or
client order fills as market volume. Maintain the existing chart interactions and
PS-25/PS-26 features, adapting their inputs to the shared data contract.

## Verification

Implementation and executed verification results are recorded below when complete.
