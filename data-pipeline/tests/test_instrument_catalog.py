import pytest

from src.instrument_catalog import (
    AssetClass,
    COMMON_STOCKS,
    INSTRUMENTS_BY_SYMBOL,
    SYMBOL_CONFIG,
    InstrumentSpec,
    instruments_for,
)


def test_common_stock_catalog_preserves_mvp_symbols():
    assert set(INSTRUMENTS_BY_SYMBOL) == {"AAPL", "MSFT", "NVDA", "AMZN", "GOOGL"}
    assert instruments_for(AssetClass.COMMON_STOCK) == COMMON_STOCKS


def test_generator_compatibility_config_comes_from_typed_catalog():
    aapl = INSTRUMENTS_BY_SYMBOL["AAPL"]
    assert SYMBOL_CONFIG["AAPL"] == {
        "start_price": aapl.start_price,
        "drift": aapl.drift,
        "volatility": aapl.volatility,
    }


def test_instrument_spec_normalizes_identifiers():
    spec = InstrumentSpec(" eurusd ", " fx ", " usd ", AssetClass.FX, 1.1, 0.01, 0.1)
    assert (spec.symbol, spec.market_code, spec.currency) == ("EURUSD", "FX", "USD")


def test_invalid_future_instrument_configuration_is_rejected():
    with pytest.raises(ValueError, match="start_price must be positive"):
        InstrumentSpec("BTCUSD", "CRYPTO", "USD", AssetClass.CRYPTO, 0, 0.1, 0.5)
