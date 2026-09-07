"""Tests for NextTrade synthetic quote generation."""

import numpy as np
import pandas as pd
import pytest

from src.generate_quotes import (
    SYMBOL_CONFIG,
    generate_price_path,
    generate_quotes,
    validate_quotes,
    
)

def test_expected_row_count() -> None:
    """One quote should be generated per symbol and period."""
    periods = 10
    quotes = generate_quotes(periods=periods, seed=42)
    
    assert len(quotes) == len(SYMBOL_CONFIG) * periods
    

def test_required_columns_exist() -> None:
    """Generated quotes should contain the complete quote contract."""
    
    quotes = generate_quotes(periods=5, seed=42)
    
    expected_columns = {
        "symbol",
        "quote_timestamp",
        "price",
        "bid",
        "ask",
        "currency",
        "source",
        "synthetic",
        
    }
    
    assert expected_columns.issubset(quotes.columns)
    

def test_prices_are_positive_and_ordered() -> None:
    """Each quote should satisfy bid-price-ask relationship."""
    quotes = generate_quotes(periods=20, seed=42)
    
    assert (quotes[["price", "bid", "ask"]] > 0).all().all()
    assert (quotes["bid"] <= quotes["price"]).all()
    assert (quotes["price"] <= quotes["ask"]).all()
    

def test_quotes_use_required_labels() -> None:
    """Every generated quote should identify its currency and source."""
    quotes = generate_quotes(periods=5, seed=42)
    
    assert quotes["currency"].eq("USD").all()
    assert quotes["source"].eq("SYNTHETIC_GBM").all()
    assert quotes["synthetic"].eq(True).all()
    
def test_symbol_timestamp_pairs_are_unique() -> None:
    """No symbol and timestamp pair should be duplicated."""
    quotes = generate_quotes(periods=20, seed=42)
    
    assert not quotes.duplicated(
        ["symbol", "quote_timestamp"]
    ).any()
    
def test_same_seed_produces_same_quotes() -> None:
    """Same configuration should produce reproducible output."""
    first = generate_quotes(periods=20, seed=42)
    second = generate_quotes(periods=20, seed=42)
    
    pd.testing.assert_frame_equal(first, second)
    
def test_different_seed_changes_prices() -> None:
    """Different seeds should produce different price paths."""
    first = generate_quotes(periods=20, seed=42)
    second = generate_quotes(periods=20, seed=99)
    
    assert not first["price"].equals(second["price"])

def test_timestamps_are_chronological() -> None:
    """Quote timestamps should increase within every symbol."""
    quotes = generate_quotes(periods=20, seed=42)
    
    for _, symbol_quotes in quotes.groupby("symbol"):
        assert symbol_quotes[
            "quote_timestamp"
        ].is_monotonic_increasing

def test_validation_rejects_duplicate_quote() -> None:
    """Validation should reject a quote if it duplicates an existing symbol-timestamp pair."""
    quotes = generate_quotes(periods=5, seed=42)
    duplicate = pd.concat(
        [quotes, quotes.iloc[[0]]],
        ignore_index=True
    )
    
    with pytest.raises(ValueError, match="must be unique"):
        validate_quotes(duplicate)

def test_invalid_start_price_is_rejected() -> None:
    """Validation should reject a quote if it has a below zero start price."""
    rng = np.random.default_rng(seed=42)
    
    with pytest.raises(
        ValueError,
        match="must be positive",
    ):
        generate_price_path(
            start_price=0,
            drift=0.08,
            volatility=0.25,
            periods=10,
            rng=rng,
        )