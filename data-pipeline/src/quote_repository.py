"""Append-only PostgreSQL quote persistence and retrieval."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID

@dataclass(frozen=True)
class StoredQuote:
    quote_id: UUID
    instrument_id: UUID
    market_code: str
    symbol: str
    bid: Decimal
    ask: Decimal
    midpoint: Decimal
    quoted_at: datetime
    currency: str
    source: str
    is_synthetic: bool

class QuoteRepository:
    def __init__(self, connection): self.connection = connection

    def insert_many(self, rows: list[tuple]) -> tuple[int, int]:
        inserted = 0
        with self.connection.cursor() as cur:
            for row in rows:
                cur.execute("""
                    INSERT INTO quotes(instrument_id, bid, ask, quoted_at, source, is_synthetic)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (instrument_id, quoted_at, source) DO NOTHING
                    RETURNING quote_id
                """, row)
                inserted += 1 if cur.fetchone() else 0
        return inserted, len(rows) - inserted

    def latest_by_instrument_id(self, instrument_id: UUID) -> StoredQuote | None:
        with self.connection.cursor() as cur:
            cur.execute("""
                SELECT q.quote_id, i.instrument_id, i.market_code, i.symbol,
                       q.bid, q.ask, ROUND((q.bid + q.ask) / 2, 8), q.quoted_at,
                       i.currency, q.source, q.is_synthetic
                FROM quotes q JOIN instruments i ON i.instrument_id = q.instrument_id
                WHERE i.instrument_id = %s
                ORDER BY q.quoted_at DESC, q.created_at DESC, q.quote_id DESC
                LIMIT 1
            """, (instrument_id,))
            row = cur.fetchone()
        return StoredQuote(*row) if row else None

    def latest_by_market_symbol(self, market_code: str, symbol: str) -> StoredQuote | None:
        with self.connection.cursor() as cur:
            cur.execute("""
                SELECT q.quote_id, i.instrument_id, i.market_code, i.symbol,
                       q.bid, q.ask, ROUND((q.bid + q.ask) / 2, 8), q.quoted_at,
                       i.currency, q.source, q.is_synthetic
                FROM quotes q JOIN instruments i ON i.instrument_id = q.instrument_id
                WHERE i.market_code = %s AND i.symbol = %s AND i.enabled AND i.tradable
                ORDER BY q.quoted_at DESC, q.created_at DESC, q.quote_id DESC
                LIMIT 1
            """, (market_code.strip().upper(), symbol.strip().upper()))
            row = cur.fetchone()
        return StoredQuote(*row) if row else None
