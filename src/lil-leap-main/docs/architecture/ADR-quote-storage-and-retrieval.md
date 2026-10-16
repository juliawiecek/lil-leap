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
Destructive retention is disabled by default (`QUOTE_RETENTION_DAYS=0`).

Orders implements quote freshness checks, durable acceptance/claiming,
account-level locking, fills and atomic ledger/cache settlement. These are no
longer future work. The independent external HTTP provider shown in the target
diagram remains a feature gap; generation currently runs inside the quote service.
See [service boundaries](service-boundaries.md) for deployment and limitations.
