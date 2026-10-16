\set ON_ERROR_STOP on
BEGIN;
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
DO $$ BEGIN
 IF (SELECT count(*) FROM instruments WHERE market_code='NASDAQ' AND symbol IN ('AAPL','MSFT','NVDA','AMZN','GOOGL') AND asset_class='COMMON_STOCK' AND currency='USD' AND enabled AND tradable) <> 5 THEN RAISE EXCEPTION 'instrument seed verification failed'; END IF;
END $$;
INSERT INTO quotes(instrument_id,bid,ask,quoted_at,source,is_synthetic)
SELECT instrument_id,100,101,'2026-09-17 20:00:00+00','SYNTHETIC_GBM',TRUE FROM instruments WHERE market_code='NASDAQ' AND symbol='AAPL'
ON CONFLICT DO NOTHING;
INSERT INTO quotes(instrument_id,bid,ask,quoted_at,source,is_synthetic)
SELECT instrument_id,100,101,'2026-09-17 20:00:00+00','SYNTHETIC_GBM',TRUE FROM instruments WHERE market_code='NASDAQ' AND symbol='AAPL'
ON CONFLICT DO NOTHING;
DO $$ BEGIN
 IF (SELECT count(*) FROM quotes q JOIN instruments i USING(instrument_id) WHERE i.market_code='NASDAQ' AND i.symbol='AAPL' AND q.quoted_at='2026-09-17 20:00:00+00' AND q.source='SYNTHETIC_GBM' AND q.is_synthetic) <> 1 THEN RAISE EXCEPTION 'quote idempotency failed'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: US-equity seed and quote ingestion constraints verified' AS result;
