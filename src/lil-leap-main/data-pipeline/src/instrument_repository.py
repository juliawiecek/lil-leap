"""Precise instrument lookup by market and symbol."""
from __future__ import annotations
from dataclasses import dataclass
from uuid import UUID

class InstrumentNotFoundError(LookupError): pass
class InstrumentUnavailableError(LookupError): pass

@dataclass(frozen=True)
class Instrument:
    instrument_id: UUID
    market_code: str
    symbol: str
    currency: str
    asset_class: str
    enabled: bool
    tradable: bool

class InstrumentRepository:
    def __init__(self, connection): self.connection = connection

    def resolve(self, market_code: str, symbol: str, require_tradable: bool = True) -> Instrument:
        market = market_code.strip().upper()
        ticker = symbol.strip().upper()
        with self.connection.cursor() as cur:
            cur.execute("""
                SELECT instrument_id, market_code, symbol, currency, asset_class, enabled, tradable
                FROM instruments
                WHERE market_code = %s AND symbol = %s
            """, (market, ticker))
            row = cur.fetchone()
        if row is None:
            raise InstrumentNotFoundError(f"Unknown instrument: {market}:{ticker}")
        instrument = Instrument(*row)
        if require_tradable and (not instrument.enabled or not instrument.tradable):
            raise InstrumentUnavailableError(f"Instrument is not available: {market}:{ticker}")
        return instrument
