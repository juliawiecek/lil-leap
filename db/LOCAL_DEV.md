# Database — Local Development

## Prerequisites
- PostgreSQL 16 installed locally
- A local PostgreSQL admin account you can use to connect to the default `postgres` database
- `psql` available on your PATH

## Bootstrap the local database

From the repository root, run:

```cmd
psql -h localhost -p 5432 -U postgres -d postgres -f db\setup-local.sql
```

## What `setup-local.sql` does

The script handles the native local bootstrap from end to end:

- creates role `main` if it does not already exist
- creates role `app_user` if it does not already exist
- creates database `nexttrade` owned by `main` if it does not already exist
- connects to `nexttrade`
- loads `db/finalized-schema.sql` when the schema is missing
- replays the safe migrations in `db/migrations`
- loads the idempotent seeds on every run:
  - `db/seeds/001_us_equity_instruments.sql`: 33 US stocks across NASDAQ and NYSE
  - `db/seeds/002_test_users.sql`: the test logins
  - `db/seeds/003_demo_trading_activity.sql`: 12 demo traders and about two weeks of trades, with 60 fills
    today across every instrument. Re-running the script on a later day adds that day's trades again.
    The insights reporting CSV holds the same fills; regenerate all three with
    `python db/seeds/generate_demo_trades.py`, never edit them by hand.
- grants the application permissions required by the backend services

## Notes

- Run the script as a PostgreSQL administrator, not as `main` or `app_user`.
- The command does **not** start PostgreSQL; PostgreSQL must already be running on `localhost:5432`.
- If the schema already exists, the script keeps the existing schema and prints a message instead of replacing it.
- Reporting-replica setup used by Docker Compose is intentionally not part of this local-only bootstrap.

