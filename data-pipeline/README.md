# NextTrade Offline Market Data Pipeline

## Purpose

This component generates reproducible synthetic US-equity quotes for
NextTrade environments that cannot access an external market-data API.

The generated quotes are intended for development, automated testing,
demonstration, and analytics. They are not live market data, investment
advice, or predictions of actual future prices.

## MVP Scope

The initial implementation supports:

- US common-stock symbols
- USD prices
- Whole-share market-order workflows
- Time-varying synthetic quotes
- Offline operation
- Reproducible results using a fixed random seed
- Geometric Brownian Motion as the synthetic price model

## Quote Contract

Each quote contains the following fields:

- `symbol`: Supported US-equity ticker
- `quote_timestamp`: UTC timestamp for the quote
- `price`: Synthetic reference price
- `bid`: Synthetic bid price
- `ask`: Synthetic ask price
- `currency`: Always `USD` in the MVP
- `source`: Always `SYNTHETIC_GBM`
- `synthetic`: Always `true`

## Example

```csv
symbol,quote_timestamp,price,bid,ask,currency,source,synthetic
AAPL,2026-09-08T14:30:00Z,225.4300,225.4100,225.4500,USD,SYNTHETIC_GBM,true