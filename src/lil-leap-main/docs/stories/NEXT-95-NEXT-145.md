# NEXT-95 and NEXT-145 implementation notes

## NEXT-95: Quote-service structure

The Python quote generator still supports the same five NASDAQ common stocks. `instrument_catalog.py` moves instrument identity and asset-class metadata into immutable typed objects. Existing code continues to consume `SYMBOL_CONFIG`, so the generated quote contract and current tests remain compatible. Future FX or crypto work can add catalog entries and generation strategies without coupling those decisions to persistence or Flask routing.

## NEXT-145: Instrument discovery endpoints

Updated for NEXT-193: the Holdings Spring Boot service owns these read-only endpoints, moved from Insights:

- `GET /api/v1/instruments`
- `GET /api/v1/instruments/{instrumentId}`

The controller delegates to a service, which delegates to a JDBC repository. Responses expose the database instrument identifier, symbol, name, asset class, market, currency, sector, enabled state, and tradability. An unknown UUID returns `404` with code `INSTRUMENT_NOT_FOUND`.

Holdings explicitly allows these routes for authenticated TRADER or ANALYST tokens and denies unrelated routes. Reach them through the trading gateway on port 4200. See [current service ownership](../architecture/service-boundaries.md).
