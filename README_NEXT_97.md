# NEXT-97 Bundle

Adds authenticated, ownership-safe, idempotent `POST /api/v1/orders` submission.

The endpoint persists a `SUBMITTED` market order. It does not price or execute the order. Quote-at-execution, stale-quote checks, fills, and settlement remain later stories.
