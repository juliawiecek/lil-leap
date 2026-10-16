-- Idempotent current-MVP seed: synthetic US equities only.
INSERT INTO instruments(symbol, instrument_name, asset_class, market_code, currency, sector, enabled, tradable) VALUES
('AAPL','Apple Inc.','COMMON_STOCK','NASDAQ','USD','Technology',TRUE,TRUE),
('MSFT','Microsoft Corporation','COMMON_STOCK','NASDAQ','USD','Technology',TRUE,TRUE),
('NVDA','NVIDIA Corporation','COMMON_STOCK','NASDAQ','USD','Technology',TRUE,TRUE),
('AMZN','Amazon.com, Inc.','COMMON_STOCK','NASDAQ','USD','Consumer Discretionary',TRUE,TRUE),
('GOOGL','Alphabet Inc.','COMMON_STOCK','NASDAQ','USD','Communication Services',TRUE,TRUE)
ON CONFLICT (market_code, symbol) DO UPDATE SET
instrument_name=EXCLUDED.instrument_name, asset_class=EXCLUDED.asset_class, currency=EXCLUDED.currency,
sector=EXCLUDED.sector, enabled=EXCLUDED.enabled, tradable=EXCLUDED.tradable;
