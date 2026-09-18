"""Generate and atomically persist synthetic US-equity quotes."""
from __future__ import annotations
import argparse, os, signal, time
from datetime import datetime, timezone
from decimal import Decimal
import pandas as pd
from src.database import connect, DatabaseUnavailableError
from src.generate_quotes import generate_quotes, validate_quotes
from src.instrument_repository import InstrumentRepository
from src.quote_repository import QuoteRepository

MARKET_CODE = "NASDAQ"

class QuoteIngestionError(RuntimeError): pass

def transform_batch(frame: pd.DataFrame, instruments: InstrumentRepository) -> list[tuple]:
    try:
        validate_quotes(frame)
    except ValueError as e:
        raise QuoteIngestionError(str(e)) from e
    resolved = {}
    for symbol in sorted(frame["symbol"].str.strip().str.upper().unique()):
        resolved[symbol] = instruments.resolve(MARKET_CODE, symbol)
    rows=[]
    for record in frame.to_dict("records"):
        symbol=str(record["symbol"]).strip().upper()
        inst=resolved[symbol]
        if str(record["currency"]).strip().upper() != inst.currency.strip().upper():
            raise QuoteIngestionError(f"Currency mismatch for {MARKET_CODE}:{symbol}")
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
    start=datetime.now(timezone.utc).replace(microsecond=0).isoformat()
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

def run_continuous(interval: float, seed: int, stop=None, sleep=time.sleep) -> None:
    should_stop=stop or (lambda: False); attempt=0; batch=0
    while not should_stop():
        started=time.monotonic()
        try:
            frame=generate_current(1, seed + batch)
            with connect() as conn: inserted, skipped=ingest_frame(frame, conn)
            print(f"quote batch inserted={inserted} skipped={skipped} symbols={len(frame)}")
            attempt=0; batch += 1
        except DatabaseUnavailableError as exc:
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
    run_continuous(float(os.getenv("QUOTE_INTERVAL_SECONDS", "5")), args.seed, lambda: stopped)
if __name__ == "__main__": main()
