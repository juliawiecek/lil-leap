# ADR: PostgreSQL quote storage and retrieval

## Decision

The MVP supports five synthetic NASDAQ US equities: AAPL, MSFT, NVDA, AMZN and
GOOGL. The Python quote service generates and persists GBM observations. Flask
serves stored quotes, and Orders reads the same PostgreSQL primary through JDBC.
Orders does not synchronously call Flask during execution. Insights reads the
reporting replica; it does not own quote ingestion or order execution.

## Consequences

Records preserve quote ID, instrument ID, timestamp, source and synthetic
provenance. Quote selection uses observation time, creation time and quote ID.
Quotes are never deleted; there is no retention job.

Orders implements quote freshness checks, durable acceptance/claiming,
account-level locking, fills and atomic ledger/cache settlement. These are no
longer future work. The independent external HTTP provider shown in the target
diagram remains a feature gap; generation currently runs inside the quote service.
See [service boundaries](service-boundaries.md) for deployment and limitations.

## Update: generation moved into Holdings

The separate Python quote service (`data-pipeline` / `quote-service`) was retired
so the system runs five services: Identity, Holdings & Trade, Orders, Insights and
Kafka. Holdings now generates the quotes with the same GBM model, catalog and
`SYNTHETIC_GBM` source tag, and already served every quote read. The Flask
`GET /api/v1/quotes/{symbol}` endpoint had no callers and was removed. Orders still
reads stored quotes through JDBC, unchanged.
