"""Generate reproducible synthetic US-equity quotes for NextTrade."""

from argparse import ArgumentParser
from pathlib import Path

import numpy as np
import pandas as pd


SYMBOL_CONFIG = {
    "AAPL": {"start_price": 225.00, "drift": 0.08, "volatility": 0.25},
    "MSFT": {"start_price": 510.00, "drift": 0.08, "volatility": 0.22},
    "NVDA": {"start_price": 175.00, "drift": 0.10, "volatility": 0.40},
    "AMZN": {"start_price": 235.00, "drift": 0.08, "volatility": 0.28},
    "GOOGL": {"start_price": 205.00, "drift": 0.08, "volatility": 0.24}
}


def generate_price_path(
    start_price: float,
    drift: float,
    volatility: float,
    periods: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """Generate a positive price path using Geometric Brownian Motion.
    
    Args:
        start_price: Initial synthetic price.
        drift: Annualized expected rate of change.
        volatility: Annualized standard deviation of returns.
        periods: Number of one-minute quotes to generate.
        rng: Seeded Numpy random number generator.

    Returns:
        An array containing one generated price per period.
        
    Raises:
        ValueError: If a numeric configuration value is invalid (e.g., negative start price, negative periods, negative volatility).
    """
    
    
    """Explaining the Formulas below:

    Geometric Brownian Motion (GBM) is used to model stock prices. The formula for the price at time t is:
        S_t = S_0 * exp((drift - 0.5 * volatility^2) * dt + volatility * sqrt(dt) * Z_t)
    where Z_t is a standard normal random variable.
    
    The math for the increments is derived from the GBM formula, representing the log returns over each time step.
    """
    
    if start_price <= 0:
        raise ValueError("start_price must be positive.")
    if periods <= 0:
        raise ValueError("periods must be positive.")
    if volatility < 0:
        raise ValueError("volatility must be non-negative.")


    minutes_per_year = 252 * 6.5 * 60  # Trading minutes in a year
    time_step = 1 / minutes_per_year
    
    shocks = rng.normal(0.0, 1.0, periods - 1)
    increments = (
        (drift - 0.5 * volatility**2) * time_step
        + volatility * np.sqrt(time_step) * shocks
    )
    
    prices = np.empty(periods)
    prices[0] = start_price
    
    if periods > 1:
        prices[1:] = start_price * np.exp(np.cumsum(increments))
    return prices
    
          
def generate_quotes(
    periods: int = 390, 
    seed: int = 42,
    start_timestamp: str = "2026-09-08T13:30:00Z",   
) -> pd.DataFrame:
    """
    Generate validated-format synthetic quotes for supported symbols.

    Args:
        periods: Number of one-minute quotes generated per symbol.
        seed: Seed used to make output reproducible.
        start_timestamp: UTC timestamp for the first generated quote.

    Returns:
        A DataFrame containing synthetic quote observations.
    """
    
    rng = np.random.default_rng(seed)
    
    timestamps = pd.date_range(
        start=start_timestamp,
        periods=periods,
        freq="min",
        tz="UTC",
    )
    
    
    quote_frames = []
    
    
    for symbol, config in SYMBOL_CONFIG.items():
        prices = generate_price_path(
            start_price=config["start_price"],
            drift=config["drift"],
            volatility=config["volatility"],
            periods=periods,
            rng=rng,
        )
        
        prices = np.round(prices, 4)
        spread = np.maximum(np.round(prices * 0.0002, 4), 0.0001)
        
        frame = pd.DataFrame(
            {
                "symbol": symbol, 
                "quote_timestamp": timestamps,
                "price": prices, 
                "bid": np.round(prices - spread, 4),
                "ask": np.round(prices + spread, 4),
                "currency": "USD",
                "source": "SYNTHETIC_GBM",
                "synthetic":True,
                
            }
        )
        
        quote_frames.append(frame)
    
    return pd.concat(quote_frames, ignore_index=True)


def validate_quotes(quotes: pd.DataFrame) -> None:
    """Validate generated quotes against the NextTrade quote contract.
    
    Args:
        quote: generated quote data to validate
        
    Raises:
        ValueError: If the quote dataset violates the required contract.
        
        """
        
        
    required_columns = {
        "symbol",
        "quote_timestamp",
        "price",
        "bid",
        "ask",
        "currency",
        "source",
        "synthetic",
    }
    
    missing_columns = required_columns.difference(quotes.columns)
    
    if missing_columns:
        raise ValueError(
            f"Missing required columns: {sorted(missing_columns)}"
        )
        
    if quotes.empty:
        raise ValueError("Quote dataset is empty.")
    
    if quotes[list(required_columns)].isna().any().any():
        raise ValueError("Required quote fields must not contain null values.")
    
    # re-read: Ensure that the quotes are sorted by symbol and timestamp
        
    if quotes.duplicated(["symbol", "quote_timestamp"]).any():
        raise ValueError("Symbol and timestamp combinations must be unique")
    if not (quotes[["price", "bid", "ask"]] > 0).all().all():
        raise ValueError("Price, bid, and ask must be greater than zero")
    if not (quotes["bid"] <= quotes["price"]).all():
        raise ValueError("Bid must not exceed price")
    if not (quotes["price"] <= quotes["ask"]).all():
        raise ValueError("Ask must not be below price")
    if not quotes["currency"].eq("USD").all():
        raise ValueError("All quotes must use USD")
    if not quotes["source"].eq("SYNTHETIC_GBM").all():
        raise ValueError("All quotes must identify the synthetic GBM source")
    if not quotes["synthetic"].eq(True).all():
        raise ValueError("Every generated quote must be labeled synthetic")

    actual_symbols = set(quotes["symbol"])
    if not actual_symbols.issubset(set(SYMBOL_CONFIG)):
        raise ValueError("Quote dataset contains an unsupported symbol")

    for _, symbol_quotes in quotes.groupby("symbol"):
        if not symbol_quotes["quote_timestamp"].is_monotonic_increasing:
            raise ValueError(
                "Quote timestamps must be chronological within each symbol"
            )


def load_quotes(quotes: pd.DataFrame, output_path: Path) -> None:
    """Validate and write generated quotes to a CSV file.

    Args:
        quotes: Generated quote data.
        output_path: Destination CSV path.
    """
    validate_quotes(quotes)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    quotes.to_csv(output_path, index=False)


def build_parser() -> ArgumentParser:
    """Create and return the command-line argument parser."""
    parser = ArgumentParser(
        description="Generate offline synthetic NextTrade quotes."
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("output/quotes.csv"),
    )
    parser.add_argument("--periods", type=int, default=390)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--start-timestamp",
        default="2026-09-08T13:30:00Z",
    )
    return parser


def main() -> None:
    """Generate, validate, and save synthetic quotes."""
    args = build_parser().parse_args()
    quotes = generate_quotes(
        periods=args.periods,
        seed=args.seed,
        start_timestamp=args.start_timestamp,
    )
    load_quotes(quotes, args.output)
    print(
        f"Generated {len(quotes)} quotes for "
        f"{quotes['symbol'].nunique()} symbols: {args.output}"
    )


if __name__ == "__main__":
    main()