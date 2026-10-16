"""Typed instrument catalog used by synthetic quote generation.

The MVP still generates the same five NASDAQ common stocks. The catalog keeps
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


COMMON_STOCKS: tuple[InstrumentSpec, ...] = (
    InstrumentSpec("AAPL", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 225.00, 0.08, 0.25),
    InstrumentSpec("MSFT", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 510.00, 0.08, 0.22),
    InstrumentSpec("NVDA", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 175.00, 0.10, 0.40),
    InstrumentSpec("AMZN", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 235.00, 0.08, 0.28),
    InstrumentSpec("GOOGL", "NASDAQ", "USD", AssetClass.COMMON_STOCK, 205.00, 0.08, 0.24),
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
