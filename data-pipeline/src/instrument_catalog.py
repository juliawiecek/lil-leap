"""Typed instrument catalog used by synthetic quote generation.

The MVP generates US common stocks listed on NASDAQ and NYSE. The catalog keeps
asset-class-specific generation configuration out of the generator so future
instrument classes can add their own configuration and strategy without
changing quote persistence or API contracts.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from types import MappingProxyType
from typing import Mapping


class AssetClass(str, Enum):
    """Instrument classes recognized by the quote-service domain."""

    COMMON_STOCK = "COMMON_STOCK"
    FX = "FX"
    CRYPTO = "CRYPTO"


@dataclass(frozen=True)
class InstrumentSpec:
    """Immutable generation metadata for one supported instrument."""

    symbol: str
    market_code: str
    currency: str
    asset_class: AssetClass
    start_price: float
    drift: float
    volatility: float

    def __post_init__(self) -> None:
        normalized_symbol = self.symbol.strip().upper()
        normalized_market = self.market_code.strip().upper()
        normalized_currency = self.currency.strip().upper()
        if not normalized_symbol:
            raise ValueError("symbol must not be blank")
        if not normalized_market:
            raise ValueError("market_code must not be blank")
        if len(normalized_currency) != 3:
            raise ValueError("currency must be a three-letter code")
        if self.start_price <= 0:
            raise ValueError("start_price must be positive")
        if self.volatility < 0:
            raise ValueError("volatility must be non-negative")
        object.__setattr__(self, "symbol", normalized_symbol)
        object.__setattr__(self, "market_code", normalized_market)
        object.__setattr__(self, "currency", normalized_currency)


# Must list the same symbols and markets as db/seeds/001_us_equity_instruments.sql;
# start prices are also the reference prices of db/seeds/generate_demo_trades.py.
COMMON_STOCKS: tuple[InstrumentSpec, ...] = (
    InstrumentSpec("AAPL", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 225.00, 0.08, 0.25),
    InstrumentSpec("MSFT", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 510.00, 0.08, 0.22),
    InstrumentSpec("NVDA", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 175.00, 0.10, 0.40),
    InstrumentSpec("AMZN", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 235.00, 0.08, 0.28),
    InstrumentSpec("GOOGL", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 205.00, 0.08, 0.24),
    InstrumentSpec("META", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 720.00, 0.08, 0.32),
    InstrumentSpec("TSLA", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 430.00, 0.10, 0.55),
    InstrumentSpec("AVGO", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 340.00, 0.10, 0.38),
    InstrumentSpec("AMD", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 160.00, 0.10, 0.45),
    InstrumentSpec("NFLX", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 1200.00, 0.08, 0.33),
    InstrumentSpec("COST", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 920.00, 0.07, 0.18),
    InstrumentSpec("ADBE", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 350.00, 0.06, 0.30),
    InstrumentSpec("PEP", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 145.00, 0.04, 0.16),
    InstrumentSpec("INTC", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 36.00, 0.03, 0.42),
    InstrumentSpec("JPM", "NYSE", "USD", AssetClass.COMMON_STOCK, 300.00, 0.07, 0.22),
    InstrumentSpec("V", "NYSE", "USD", AssetClass.COMMON_STOCK, 345.00, 0.07, 0.19),
    InstrumentSpec("BAC", "NYSE", "USD", AssetClass.COMMON_STOCK, 50.00, 0.06, 0.26),
    InstrumentSpec("GS", "NYSE", "USD", AssetClass.COMMON_STOCK, 780.00, 0.07, 0.27),
    InstrumentSpec("XOM", "NYSE", "USD", AssetClass.COMMON_STOCK, 115.00, 0.05, 0.24),
    InstrumentSpec("CVX", "NYSE", "USD", AssetClass.COMMON_STOCK, 155.00, 0.05, 0.25),
    InstrumentSpec("JNJ", "NYSE", "USD", AssetClass.COMMON_STOCK, 190.00, 0.04, 0.15),
    InstrumentSpec("UNH", "NYSE", "USD", AssetClass.COMMON_STOCK, 350.00, 0.05, 0.30),
    InstrumentSpec("PFE", "NYSE", "USD", AssetClass.COMMON_STOCK, 25.00, 0.03, 0.24),
    InstrumentSpec("LLY", "NYSE", "USD", AssetClass.COMMON_STOCK, 820.00, 0.09, 0.30),
    InstrumentSpec("WMT", "NYSE", "USD", AssetClass.COMMON_STOCK, 102.00, 0.06, 0.17),
    InstrumentSpec("KO", "NYSE", "USD", AssetClass.COMMON_STOCK, 68.00, 0.04, 0.14),
    InstrumentSpec("PG", "NYSE", "USD", AssetClass.COMMON_STOCK, 152.00, 0.04, 0.15),
    InstrumentSpec("HD", "NYSE", "USD", AssetClass.COMMON_STOCK, 400.00, 0.06, 0.22),
    InstrumentSpec("DIS", "NYSE", "USD", AssetClass.COMMON_STOCK, 112.00, 0.05, 0.27),
    InstrumentSpec("CAT", "NYSE", "USD", AssetClass.COMMON_STOCK, 470.00, 0.07, 0.28),
    InstrumentSpec("BA", "NYSE", "USD", AssetClass.COMMON_STOCK, 215.00, 0.05, 0.35),
    InstrumentSpec("NEE", "NYSE", "USD", AssetClass.COMMON_STOCK, 80.00, 0.05, 0.20),
    InstrumentSpec("PLD", "NYSE", "USD", AssetClass.COMMON_STOCK, 115.00, 0.05, 0.24),
)

INSTRUMENTS_BY_SYMBOL: Mapping[str, InstrumentSpec] = MappingProxyType(
    {instrument.symbol: instrument for instrument in COMMON_STOCKS}
)

# Compatibility contract used by existing generator/tests. Values remain in the
# exact shape used before NEXT-95 while their source is now the typed catalog.
SYMBOL_CONFIG: Mapping[str, Mapping[str, float]] = MappingProxyType(
    {
        instrument.symbol: MappingProxyType(
            {
                "start_price": instrument.start_price,
                "drift": instrument.drift,
                "volatility": instrument.volatility,
            }
        )
        for instrument in COMMON_STOCKS
    }
)


def instruments_for(asset_class: AssetClass) -> tuple[InstrumentSpec, ...]:
    """Return catalog entries for an asset class without changing MVP scope."""

    return tuple(
        instrument
        for instrument in INSTRUMENTS_BY_SYMBOL.values()
        if instrument.asset_class is asset_class
    )
