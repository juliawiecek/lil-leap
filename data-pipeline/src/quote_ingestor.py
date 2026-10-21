"""Generate and atomically persist synthetic US-equity quotes."""
from __future__ import annotations
import argparse, os, signal, time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import pandas as pd
import numpy as np
from src.database import connect, DatabaseUnavailableError
from src.generate_quotes import generate_quotes, generate_price_path, validate_quotes
from src.instrument_catalog import INSTRUMENTS_BY_SYMBOL, SYMBOL_CONFIG
from src.instrument_repository import InstrumentRepository
from src.quote_repository import QuoteRepository

MARKET_CODE = "NASDAQ"

def market_for(symbol: str) -> str:
    spec = INSTRUMENTS_BY_SYMBOL.get(symbol)
    return spec.market_code if spec else MARKET_CODE

class QuoteIngestionError(RuntimeError): pass

def transform_batch(frame: pd.DataFrame, instruments: InstrumentRepository) -> list[tuple]:
    try:
        validate_quotes(frame)
    except ValueError as e:
        raise QuoteIngestionError(str(e)) from e
    resolved = {}
    for symbol in sorted(frame["symbol"].str.strip().str.upper().unique()):
        resolved[symbol] = instruments.resolve(market_for(symbol), symbol)
    rows=[]
    for record in frame.to_dict("records"):
        symbol=str(record["symbol"]).strip().upper()
        inst=resolved[symbol]
        if str(record["currency"]).strip().upper() != inst.currency.strip().upper():
            raise QuoteIngestionError(f"Currency mismatch for {inst.market_code}:{symbol}")
        ts=pd.Timestamp(record["quote_timestamp"])
        if ts.tzinfo is None: ts=ts.tz_localize("UTC")
        rows.append((inst.instrument_id, Decimal(str(record["bid"])), Decimal(str(record["ask"])),
                     ts.to_pydatetime(), str(record["source"]), bool(record["synthetic"])))
    return rows

def ingest_frame(frame: pd.DataFrame, connection) -> tuple[int,int]:
    try:
        rows=transform_batch(frame, InstrumentRepository(connection))
        counts=QuoteRepository(connection).insert_many(rows)
        connection.commit()
        return counts
    except Exception:
        connection.rollback()
        raise

def generate_current(periods: int, seed: int) -> pd.DataFrame:
    # Keep the most recent generated quote at "now" so execution freshness checks pass.
    latest = datetime.now(timezone.utc).replace(microsecond=0)
    start = (latest - timedelta(minutes=max(periods - 1, 0))).isoformat()
    return generate_quotes(periods=periods, seed=seed, start_timestamp=start)

def run_once(periods: int, seed: int) -> tuple[int,int,int]:
    frame=generate_current(periods, seed)
    with connect() as conn:
        inserted, skipped=ingest_frame(frame, conn)
    print(
        f"Generated: {len(frame)}\n"
        f"Inserted: {inserted}\n"
        f"Skipped: {skipped}\n"
        f"Symbols: {frame['symbol'].nunique()}\n"
        "Source: SYNTHETIC_GBM"
    )
    return len(frame), inserted, skipped

def generate_next(previous: dict[str, float], interval: float, seed: int) -> pd.DataFrame:
    """One time-scaled GBM step from the persisted price, not the catalog anchor."""
    rng = np.random.default_rng(seed)
    now = datetime.now(timezone.utc)
    rows = []
    for symbol, config in SYMBOL_CONFIG.items():
        start = previous.get(symbol, config["start_price"])
        if not np.isfinite(start) or start <= 0:
            raise QuoteIngestionError(f"Invalid previous price for {symbol}")
        price = max(0.0002, round(float(generate_price_path(
            start, config["drift"], config["volatility"], 2, rng, step_seconds=interval
        )[-1]), 4))
        spread = max(round(price * 0.0002, 4), 0.0001)
        rows.append({"symbol": symbol, "quote_timestamp": now, "price": price,
                     "bid": round(price - spread, 4), "ask": round(price + spread, 4),
                     "currency": "USD", "source": "SYNTHETIC_GBM", "synthetic": True})
    return pd.DataFrame(rows)


def run_continuous(interval: float, seed: int, stop=None, sleep=time.sleep) -> None:
    if not np.isfinite(interval) or interval <= 0:
        raise ValueError("interval must be finite and positive")
    should_stop=stop or (lambda: False); attempt=0; batch=0
    while not should_stop():
        started=time.monotonic()
        try:
            with connect() as conn:
                previous = QuoteRepository(conn).latest_midpoints()
                frame = generate_next(previous, interval, seed + batch)
                inserted, skipped = ingest_frame(frame, conn)
            print(f"quote batch inserted={inserted} skipped={skipped} symbols={len(frame)}")
            attempt=0; batch += 1
        except DatabaseUnavailableError:
            attempt += 1
            if attempt > 5: raise
            delay=min(2 ** (attempt - 1), 16)
            print(f"PostgreSQL unavailable; retrying in {delay}s")
            sleep(delay); continue
        elapsed=time.monotonic()-started
        sleep(max(0.0, interval-elapsed))

def main():
    parser=argparse.ArgumentParser()
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--once", action="store_true")
    mode.add_argument("--continuous", action="store_true")
    parser.add_argument("--periods", type=int, default=int(os.getenv("QUOTE_PERIODS", "10")))
    parser.add_argument("--seed", type=int, default=int(os.getenv("QUOTE_SEED", "42")))
    args=parser.parse_args()
    if args.once: run_once(args.periods, args.seed); return
    stopped=False
    def handle(*_):
        nonlocal stopped; stopped=True
    signal.signal(signal.SIGTERM, handle); signal.signal(signal.SIGINT, handle)
    run_continuous(float(os.getenv("QUOTE_INTERVAL_SECONDS", "2")), args.seed, lambda: stopped)
if __name__ == "__main__": main()
