# ADR: PostgreSQL quote storage and retrieval

## Decision
The current MVP supports five synthetic NASDAQ US equities only: AAPL, MSFT, NVDA, AMZN, and GOOGL. Python generates GBM observations; PostgreSQL is the append-only durable quote store; Flask reads PostgreSQL by default; Spring Boot reads PostgreSQL directly through a DAO.

## Consequences
The execution-critical path avoids a synchronous Flask hop. Records preserve quote ID, instrument ID, timestamp, source, and synthetic provenance. Selection is deterministic by observation time, creation time, and quote ID. Automatic destructive retention is disabled. Execution-time freshness, acceptance, locking decisions, fills, and atomic settlement remain follow-up work.
