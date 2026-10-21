# Reporting dataset

`trades.csv` is the standalone mock source used by BR-16 report generation and the Clients page. Trade lookup reads the trading database instead. It is intentionally separate from the live database so neither competes with trading workloads.

## Columns

| Column | Why it exists | Schema / entity field represented | Used by |
| --- | --- | --- | --- |
| `fill_id` | Unique trade row identifier in the dataset | `fills.fill_id` | All report generators as the row identity |
| `order_id` | Links each fill back to the source order | `orders.order_id` | Context for instrument and segment reports |
| `filled_at` | Event timestamp used for time-based analysis | `fills.filled_at` | Trading activity report |
| `instrument_id` | Stable instrument key used for joins and traceability | `instruments.instrument_id` / `orders.instrument_id` | Instrument report |
| `instrument_symbol` | Human-readable instrument grouping key | `instruments.symbol` | Instrument report |
| `instrument_name` | Display name for the instrument | `instruments.instrument_name` | Instrument report |
| `asset_class` | Lets reports distinguish equities, FX, and crypto | `instruments.asset_class` | Instrument report |
| `market_code` | Distinguishes venue or market source for the instrument | `instruments.market_code` | Instrument report |
| `user_id` | Identifies the client behind the trade | `users.user_id` | Client segment and activity reports |
| `client_email` | Human-readable client identifier | `users.email` | Client segment and activity reports, Clients page |
| `client_name` | Client's first and last name | `customer_profiles.first_name`, `last_name` | Clients page |
| `account_id` | Trading account identifier | `accounts.account_id` | Client segment and activity reports |
| `account_number` | Human-readable trading account number | `accounts.account_number` | Client segment and activity reports, Clients page |
| `account_name` | Account label | `accounts.account_name` | Clients page |
| `account_status` | Shows whether the account is active, blocked, etc. | `accounts.account_status` | Client segment report |
| `trader_level` | Business segment used for client grouping | `accounts.trader_level` | Client segment report |
| `side` | Indicates buy or sell activity for context | `orders.side` | All report generators |
| `filled_quantity` | Base quantity used to compute traded volume | `fills.filled_quantity` | All report generators |
| `execution_price` | Price used to compute traded value / notional | `fills.execution_price` | All report generators |

## Endpoint mapping

- `GET /reports/generate/instrument-report`
  - Aggregates by `instrument_symbol`, `instrument_name`, `asset_class`, and `market_code`.
- `GET /reports/generate/client-segment-report`
  - Aggregates by `trader_level`.
- `GET /reports/generate/trading-activity-report`
  - Aggregates by `filled_at` date and hour in New York time (`America/New_York`).

## Notes

- The file is generated, do not edit it by hand: `python db/seeds/generate_demo_trades.py` writes it together with
  `db/seeds/001_us_equity_instruments.sql` and `db/seeds/003_demo_trading_activity.sql` from one trade book.
- It holds every fill the dev seeds put in the database (the `003` demo book plus the `002` test-user fills) with the
  same fill, order, user, account and instrument ids, quantities, prices and UTC times of day. The CSV is anchored at
  2026-10-16; the database places the same book relative to the day it was seeded, so only the dates shift.
  Instrument ids match on a database created after fixed instrument ids were introduced.
- `python db/seeds/generate_demo_trades.py --check` fails if this file is out of date with the seeds.
- No live database access is required for BR-16 report generation.
- The CSV parser and writer in the reporting service are responsible for reading this file and producing downloadable CSV attachments.

