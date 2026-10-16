# NEXT-97 Bundle

> **Historical document — superseded by NEXT-193.** The original bundle paths,
> commands, ports and policy descriptions below are retained as story history;
> do not use them for current setup. Follow [Getting started](GETTING_STARTED.md),
> [Database setup](DATABASE_SETUP.md) and [Service boundaries](architecture/service-boundaries.md).
> Portfolio/instrument APIs now belong to Holdings, order submission/execution to
> Orders, and reporting to Insights. There is no `backend/` service. Minimum trader
> age is 21; older age-18 examples below are obsolete.

Drag and drop this bundle into the repository root on `feature/NEXT-97-order-submission`.

It adds an authenticated, ownership-safe, idempotent `POST /api/v1/orders` endpoint and focused automated tests. See `RUN_NEXT_97.md`.
