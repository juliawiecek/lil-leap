from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
import pytest
from src.quote_provider import PostgresQuoteProvider, QuoteNotFoundError
from src.quote_repository import StoredQuote

class Connection:
    def __enter__(self): return self
    def __exit__(self,*_): pass

def test_postgres_provider_maps_stable_contract(monkeypatch):
    quote=StoredQuote(uuid4(),uuid4(),"NASDAQ","AAPL",Decimal("99"),Decimal("101"),Decimal("100"),datetime.now(timezone.utc),"USD","SYNTHETIC_GBM",True)
    monkeypatch.setattr("src.quote_provider.QuoteRepository.latest_by_market_symbol", lambda *_: quote)
    result=PostgresQuoteProvider(lambda: Connection()).get_quote(" aapl ")
    assert result.symbol == "AAPL" and result.price == 100.0 and result.synthetic is True

def test_postgres_provider_not_found(monkeypatch):
    monkeypatch.setattr("src.quote_provider.QuoteRepository.latest_by_market_symbol", lambda *_: None)
    with pytest.raises(QuoteNotFoundError): PostgresQuoteProvider(lambda: Connection()).get_quote("ZZZZ")
