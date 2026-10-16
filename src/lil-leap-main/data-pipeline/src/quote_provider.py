"""Quote provider and cache for the NextTrade synthetic market feed."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from time import monotonic
from typing import Callable

import pandas as pd

from src.generate_quotes import generate_quotes, load_quotes
from src.database import connect, DatabaseUnavailableError
from src.quote_repository import QuoteRepository


class QuoteNotFoundError(LookupError):
    """Raised when a requested symbol is unsupported or has no quote."""


class QuoteSourceError(RuntimeError):
    """Raised when the quote source cannot be created or read."""


@dataclass(frozen=True)
class Quote:
    """Stable quote contract returned by all quote providers."""

    symbol: str
    quote_timestamp: str
    price: float
    bid: float
    ask: float
    currency: str
    source: str
    synthetic: bool

    def to_dict(self) -> dict[str, object]:
        """Return the quote in JSON-friendly form."""
        return asdict(self)


class PostgresQuoteProvider:
    """Read the durable latest quote from PostgreSQL."""

    def __init__(self, connection_factory=connect, market_code: str = "NASDAQ") -> None:
        self.connection_factory = connection_factory
        self.market_code = market_code.strip().upper()

    def get_quote(self, symbol: str) -> Quote:
        ticker = symbol.strip().upper()
        try:
            with self.connection_factory() as connection:
                stored = QuoteRepository(connection).latest_by_market_symbol(self.market_code, ticker)
        except DatabaseUnavailableError as exc:
            raise QuoteSourceError("PostgreSQL quote source is unavailable") from exc
        except Exception as exc:
            raise QuoteSourceError("Unable to read PostgreSQL quote source") from exc
        if stored is None:
            raise QuoteNotFoundError(f"Quote not found for {self.market_code}:{ticker}")
        return Quote(symbol=stored.symbol, quote_timestamp=stored.quoted_at.isoformat(),
                     price=float(stored.midpoint), bid=float(stored.bid), ask=float(stored.ask),
                     currency=stored.currency.strip(), source=stored.source, synthetic=stored.is_synthetic)


class CsvQuoteProvider:
    """Read generated quotes from CSV and advance by elapsed intervals."""

    def __init__(
        self,
        csv_path: Path | str = Path("output/quotes.csv"),
        replay_interval_seconds: float = 5.0,
        periods: int = 390,
        seed: int = 42,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        if replay_interval_seconds <= 0:
            raise ValueError("Replay interval must be greater than zero")
        if periods <= 0:
            raise ValueError("Periods must be greater than zero")

        self.csv_path = Path(csv_path)
        self.replay_interval_seconds = replay_interval_seconds
        self.periods = periods
        self.seed = seed
        self.clock = clock
        self._started_at = clock()
        self._quotes_by_symbol: dict[str, pd.DataFrame] = {}
        self._load_source()

    def _load_source(self) -> None:
        """Create the CSV when missing, then load and validate it."""
        try:
            if not self.csv_path.exists():
                quotes = generate_quotes(periods=self.periods, seed=self.seed)
                load_quotes(quotes, self.csv_path)

            frame = pd.read_csv(self.csv_path)
            expected = {
                "symbol",
                "quote_timestamp",
                "price",
                "bid",
                "ask",
                "currency",
                "source",
                "synthetic",
            }
            missing = expected.difference(frame.columns)
            if missing:
                raise QuoteSourceError(
                    f"Quote source is missing columns: {sorted(missing)}"
                )

            frame["symbol"] = frame["symbol"].astype(str).str.upper().str.strip()
            frame["quote_timestamp"] = pd.to_datetime(
                frame["quote_timestamp"], utc=True, errors="raise"
            )
            frame["synthetic"] = frame["synthetic"].map(
                lambda value: str(value).strip().lower() == "true"
            )
            frame = frame.sort_values(["symbol", "quote_timestamp"])

            self._quotes_by_symbol = {
                symbol: group.reset_index(drop=True)
                for symbol, group in frame.groupby("symbol")
            }
        except QuoteSourceError:
            raise
        except Exception as exc:
            raise QuoteSourceError(f"Unable to load quote source: {exc}") from exc

    @property
    def supported_symbols(self) -> tuple[str, ...]:
        """Return the symbols currently available from the provider."""
        return tuple(sorted(self._quotes_by_symbol))

    def get_quote(self, symbol: str) -> Quote:
        """Return the current replay quote for a supported symbol."""
        normalized = symbol.upper().strip()
        rows = self._quotes_by_symbol.get(normalized)
        if rows is None or rows.empty:
            raise QuoteNotFoundError(
                f"No quote is available for symbol {normalized or symbol}"
            )

        elapsed = max(0.0, self.clock() - self._started_at)
        index = int(elapsed // self.replay_interval_seconds) % len(rows)
        row = rows.iloc[index]

        original_timestamp = pd.Timestamp(row["quote_timestamp"])
        replay_timestamp = datetime.now(timezone.utc).replace(
            microsecond=original_timestamp.microsecond
        )

        return Quote(
            symbol=normalized,
            quote_timestamp=replay_timestamp.isoformat().replace("+00:00", "Z"),
            price=float(row["price"]),
            bid=float(row["bid"]),
            ask=float(row["ask"]),
            currency=str(row["currency"]),
            source=str(row["source"]),
            synthetic=bool(row["synthetic"]),
        )


@dataclass
class _CacheEntry:
    quote: Quote
    stored_at: float


class CachedQuoteService:
    """Cache quote-provider responses for a configurable amount of time."""

    def __init__(
        self,
        provider: CsvQuoteProvider,
        cache_seconds: float = 5.0,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        if cache_seconds <= 0:
            raise ValueError("Cache duration must be greater than zero")
        self.provider = provider
        self.cache_seconds = cache_seconds
        self.clock = clock
        self._cache: dict[str, _CacheEntry] = {}
        self._lock = Lock()

    def get_quote(self, symbol: str) -> dict[str, object]:
        """Return a cached or freshly retrieved quote with cache metadata."""
        normalized = symbol.upper().strip()
        now = self.clock()

        with self._lock:
            entry = self._cache.get(normalized)
            if entry is not None:
                age_seconds = max(0.0, now - entry.stored_at)
                if age_seconds < self.cache_seconds:
                    payload = entry.quote.to_dict()
                    payload.update(
                        {
                            "cached": True,
                            "cache_age_ms": round(age_seconds * 1000, 3),
                            "cache_ttl_ms": round(self.cache_seconds * 1000, 3),
                        }
                    )
                    return payload

            quote = self.provider.get_quote(normalized)
            stored_at = self.clock()
            self._cache[normalized] = _CacheEntry(quote=quote, stored_at=stored_at)

            payload = quote.to_dict()
            payload.update(
                {
                    "cached": False,
                    "cache_age_ms": 0.0,
                    "cache_ttl_ms": round(self.cache_seconds * 1000, 3),
                }
            )
            return payload

    def clear(self) -> None:
        """Clear all cached quotes, primarily for tests and operations."""
        with self._lock:
            self._cache.clear()

