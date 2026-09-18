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
    with pytest.raises(QuoteIngestionError): transform_batch(frame("EUR"), Instruments())

class FailingConnection:
    def rollback(self): self.rolled_back=True
    rolled_back=False

def test_ingestion_rolls_back_on_failure(monkeypatch):
    connection=FailingConnection()
    monkeypatch.setattr("src.quote_ingestor.transform_batch", lambda *_: (_ for _ in ()).throw(ValueError("bad")))
    with pytest.raises(ValueError): ingest_frame(frame(), connection)
    assert connection.rolled_back
