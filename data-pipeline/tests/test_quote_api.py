"""Integration and cache tests for the NextTrade quote API."""

from pathlib import Path

import pytest

from src.app import create_app
from src.generate_quotes import generate_quotes, load_quotes
from src.quote_provider import CachedQuoteService, CsvQuoteProvider, QuoteSourceError


class FakeClock:
    """Controllable monotonic clock used to test caching deterministically."""

    def __init__(self) -> None:
        self.value = 0.0

    def __call__(self) -> float:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += seconds


class CountingProvider:
    """Minimal provider wrapper that counts source retrieval calls."""

    def __init__(self, provider: CsvQuoteProvider) -> None:
        self.provider = provider
        self.calls = 0

    def get_quote(self, symbol: str):
        self.calls += 1
        return self.provider.get_quote(symbol)


@pytest.fixture()
def quote_file(tmp_path: Path) -> Path:
    path = tmp_path / "quotes.csv"
    quotes = generate_quotes(periods=10, seed=42)
    load_quotes(quotes, path)
    return path


def test_supported_symbol_returns_quote(quote_file: Path) -> None:
    provider = CsvQuoteProvider(quote_file)
    app = create_app(provider=provider)
    client = app.test_client()

    response = client.get("/api/v1/quotes/AAPL")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["symbol"] == "AAPL"
    assert payload["price"] > 0
    assert payload["bid"] <= payload["price"] <= payload["ask"]
    assert payload["currency"] == "USD"
    assert payload["source"] == "SYNTHETIC_GBM"
    assert payload["synthetic"] is True
    assert payload["cached"] is False
    assert payload["cache_age_ms"] == 0.0


def test_symbol_lookup_is_case_insensitive(quote_file: Path) -> None:
    app = create_app(provider=CsvQuoteProvider(quote_file))
    response = app.test_client().get("/api/v1/quotes/aapl")

    assert response.status_code == 200
    assert response.get_json()["symbol"] == "AAPL"


def test_unsupported_symbol_returns_controlled_404(quote_file: Path) -> None:
    app = create_app(provider=CsvQuoteProvider(quote_file))
    response = app.test_client().get("/api/v1/quotes/NOTREAL")

    assert response.status_code == 404
    assert response.get_json()["code"] == "QUOTE_NOT_FOUND"


def test_second_request_reuses_cached_quote(quote_file: Path) -> None:
    clock = FakeClock()
    base_provider = CsvQuoteProvider(quote_file, clock=clock)
    counting_provider = CountingProvider(base_provider)
    service = CachedQuoteService(counting_provider, cache_seconds=5, clock=clock)

    first = service.get_quote("AAPL")
    clock.advance(1)
    second = service.get_quote("AAPL")

    assert counting_provider.calls == 1
    assert first["cached"] is False
    assert second["cached"] is True
    assert second["cache_age_ms"] == 1000.0
    assert second["price"] == first["price"]


def test_expired_cache_fetches_provider_again(quote_file: Path) -> None:
    clock = FakeClock()
    base_provider = CsvQuoteProvider(
        quote_file,
        replay_interval_seconds=5,
        clock=clock,
    )
    counting_provider = CountingProvider(base_provider)
    service = CachedQuoteService(counting_provider, cache_seconds=5, clock=clock)

    first = service.get_quote("AAPL")
    clock.advance(5.1)
    second = service.get_quote("AAPL")

    assert counting_provider.calls == 2
    assert second["cached"] is False
    assert second["price"] != first["price"]


def test_cache_entries_are_isolated_by_symbol(quote_file: Path) -> None:
    clock = FakeClock()
    counting_provider = CountingProvider(CsvQuoteProvider(quote_file, clock=clock))
    service = CachedQuoteService(counting_provider, cache_seconds=5, clock=clock)

    aapl = service.get_quote("AAPL")
    msft = service.get_quote("MSFT")

    assert counting_provider.calls == 2
    assert aapl["symbol"] == "AAPL"
    assert msft["symbol"] == "MSFT"


def test_source_failure_returns_503(quote_file: Path) -> None:
    class FailingService:
        def get_quote(self, symbol: str):
            raise QuoteSourceError("source unavailable")

    app = create_app(service=FailingService())
    response = app.test_client().get("/api/v1/quotes/AAPL")

    assert response.status_code == 503
    assert response.get_json()["code"] == "QUOTE_SOURCE_UNAVAILABLE"


def test_health_endpoint(quote_file: Path) -> None:
    app = create_app(provider=CsvQuoteProvider(quote_file))
    response = app.test_client().get("/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "UP"}
