# Project documentation index

## Current guides

- [Getting started](GETTING_STARTED.md): startup, tools and client ports.
- [Service boundaries](architecture/service-boundaries.md): NEXT-193 ownership, diagram, migrations and known gaps.
- [Database setup](DATABASE_SETUP.md) and [database reference](../db/README.md).
- [Quote storage ADR](architecture/ADR-quote-storage-and-retrieval.md).
- [Coverage reports](COVERAGE_REPORTS.md): regeneration and historical snapshots.

| Component | Guide |
| --- | --- |
| Identity | [auth](../auth/README.md) |
| Holdings, portfolio and instruments | [nextTrade-holdings](../nextTrade-holdings/README.md) |
| Submission and execution | [nextTrade-orders](../nextTrade-orders/README.md) |
| Replica-backed reporting | [insights](../insights/README.md) |
| Synthetic quotes | [data-pipeline](../data-pipeline/README.md) |
| Trading client | [frontend](../frontend/README.md) |
| Reporting client | [insights-frontend](../insights-frontend/README.md) |
| Shared routing | [gateway configuration](../gateway/nginx.conf) |

## Historical references

These preserve earlier story/bundle context; their old paths and commands are
superseded by the current guides above:

- [NEXT-88 runbook](RUN_NEXT_88.md)
- [NEXT-97 runbook](RUN_NEXT_97.md) and [technical notes](README_NEXT_97.md)
- [Bundle notes](README_BUNDLE.md)
- [Original database hardening runbook](RUN_DATABASE_HARDENING.md)

[NEXT-95/NEXT-145 notes](stories/NEXT-95-NEXT-145.md) include the corrected
instrument ownership. Checked-in coverage HTML and Javadocs are historical
snapshots; use current source and regenerated reports when reviewing NEXT-193.

- [Historical atomic-settlement design](architecture/ADR-TS-10.1-atomic-settlement.md)
- [Optional Kafka development setup](../kafka/README.md)
