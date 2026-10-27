BEGIN;

-- Candle and day-open reads scan one instrument's quotes; every quote row shares a heap page with
-- the other 32 instruments' quotes from the same tick, so the old index still read the whole table.
-- This covering index lets those reads stay inside the index (index-only scan).
CREATE INDEX IF NOT EXISTS idx_quotes_candles
    ON quotes (instrument_id, quoted_at DESC)
    INCLUDE (bid, ask, created_at, quote_id);

COMMIT;
