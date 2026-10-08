from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
import pandas as pd, pytest
from src.instrument_repository import Instrument
from src.quote_ingestor import transform_batch, ingest_frame, QuoteIngestionError

class Instruments:
    def resolve(self, market, symbol): return Instrument(uuid4(), market, symbol, "USD", "COMMON_STOCK", True, True)

def frame(currency="USD"):
    return pd.DataFrame([{"symbol":"AAPL","quote_timestamp":datetime.now(timezone.utc),"price":100,"bid":99.9,"ask":100.1,"currency":currency,"source":"SYNTHETIC_GBM","synthetic":True}])

def test_transform_preserves_contract():
    row=transform_batch(frame(), Instruments())[0]
    assert row[1:3] == (Decimal("99.9"), Decimal("100.1"))
    assert row[4:] == ("SYNTHETIC_GBM", True)

def test_currency_mismatch_rejected():
    quotes = frame("EUR")
    instruments = Instruments()
    with pytest.raises(QuoteIngestionError):
        transform_batch(quotes, instruments)

class FailingConnection:
    def rollback(self): self.rolled_back=True
    rolled_back=False

def test_ingestion_rolls_back_on_failure(monkeypatch):
    connection=FailingConnection()
    monkeypatch.setattr("src.quote_ingestor.transform_batch", lambda *_: (_ for _ in ()).throw(ValueError("bad")))
    quotes = frame()
    with pytest.raises(ValueError):
        ingest_frame(quotes, connection)
    assert connection.rolled_back


def test_continuous_cli_signal_stops_ingestion(monkeypatch):
    from src import quote_ingestor
    import signal
    handlers = {}
    monkeypatch.setattr("sys.argv", ["quote_ingestor", "--continuous", "--seed", "12"])
    monkeypatch.setenv("QUOTE_INTERVAL_SECONDS", "2.5")
    monkeypatch.setattr(signal, "signal", lambda signum, handler: handlers.setdefault(signum, handler))
    def run(interval, seed, stop):
        assert (interval, seed) == (2.5, 12)
        assert not stop()
        handlers[signal.SIGINT](signal.SIGINT, None)
        assert stop()
        handlers[signal.SIGTERM](signal.SIGTERM, None)
        assert stop()
    monkeypatch.setattr(quote_ingestor, "run_continuous", run)
    quote_ingestor.main()


def test_run_once_reports_committed_batch_counts(monkeypatch, capsys):
    from contextlib import nullcontext
    from unittest.mock import Mock
    from src import quote_ingestor as ingestor
    connection = object()
    quotes = frame()
    generate = Mock(return_value=quotes)
    ingest = Mock(return_value=(1, 0))
    monkeypatch.setattr(ingestor, "generate_current", generate)
    monkeypatch.setattr(ingestor, "connect", lambda: nullcontext(connection))
    monkeypatch.setattr(ingestor, "ingest_frame", ingest)
    assert ingestor.run_once(1, 42) == (1, 1, 0)
    generate.assert_called_once_with(1, 42)
    ingest.assert_called_once_with(quotes, connection)
    assert capsys.readouterr().out == "Generated: 1\nInserted: 1\nSkipped: 0\nSymbols: 1\nSource: SYNTHETIC_GBM\n"


def test_continuous_retries_then_advances_seed_and_respects_interval(monkeypatch):
    from contextlib import nullcontext
    from unittest.mock import Mock
    from src import quote_ingestor as ingestor
    generate = Mock(return_value=frame())
    connect = Mock(side_effect=[ingestor.DatabaseUnavailableError("offline"), nullcontext(object()), nullcontext(object())])
    monkeypatch.setattr(ingestor, "generate_current", generate)
    monkeypatch.setattr(ingestor, "connect", connect)
    monkeypatch.setattr(ingestor, "ingest_frame", Mock(return_value=(1, 0)))
    monkeypatch.setattr(ingestor.time, "monotonic", Mock(side_effect=[0, 1, 3, 4, 10]))
    sleeps = []
    ingestor.run_continuous(5, 42, stop=lambda: len(sleeps) == 3, sleep=sleeps.append)
    assert sleeps == [1, 3, 0]
    assert [c.args for c in generate.call_args_list] == [(1, 42), (1, 42), (1, 43)]


def test_continuous_stops_after_bounded_database_retries(monkeypatch):
    from unittest.mock import Mock
    from src import quote_ingestor as ingestor
    monkeypatch.setattr(ingestor, "generate_current", Mock(return_value=frame()))
    connect = Mock(side_effect=ingestor.DatabaseUnavailableError("offline"))
    monkeypatch.setattr(ingestor, "connect", connect)
    sleeps = []
    with pytest.raises(ingestor.DatabaseUnavailableError, match="offline"):
        ingestor.run_continuous(5, 42, sleep=sleeps.append)
    assert sleeps == [1, 2, 4, 8, 16]
    assert connect.call_count == 6


def test_once_cli_passes_periods_and_seed(monkeypatch):
    from unittest.mock import Mock
    from src import quote_ingestor as ingestor
    once = Mock()
    monkeypatch.setattr(ingestor, "run_once", once)
    monkeypatch.setattr("sys.argv", ["quote_ingestor", "--once", "--periods", "3", "--seed", "7"])
    ingestor.main()
    once.assert_called_once_with(3, 7)
