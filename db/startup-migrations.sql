-- Reviewed, repeatable upgrades for existing stack volumes. Run as the schema owner.
-- Do not glob historical migrations: some require a maintenance window or a specific baseline.
\set ON_ERROR_STOP on
-- One session owns the lock across each migration's own transaction. A failed psql
-- process releases it when its connection closes, and the next start can retry.
SELECT pg_advisory_lock(719340, 1);
\ir migrations/017_user_status.sql
\ir migrations/018_trade_clients.sql
SELECT pg_advisory_unlock(719340, 1);
