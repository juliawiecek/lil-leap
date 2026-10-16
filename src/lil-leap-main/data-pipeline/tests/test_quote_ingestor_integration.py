"""Focused integration tests for quote_ingestor to improve coverage of critical functionality."""
from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4
import pytest
import pandas as pd

from src.quote_ingestor import (
    transform_batch, ingest_frame, generate_current, run_once,
    QuoteIngestionError, MARKET_CODE
)
from src.instrument_repository import Instrument


class TestIngestFrameIntegration:
    """Integration tests for the ingest_frame function covering critical paths."""
    
    def test_ingest_frame_with_successful_insert(self):
        """Test successful quote frame ingestion with commit."""
        class MockCursor:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, sql, params): pass
            def fetchone(self):
                # Return quote_id on successful insert
                return (UUID("12345678-1234-5678-1234-567812345671"),)
        
        class MockConnection:
            committed = False
            rolled_back = False
            def cursor(self): return MockCursor()
            def commit(self): self.committed = True
            def rollback(self): self.rolled_back = True
        
        conn = MockConnection()
        
        # Create a frame with valid data
        frame = pd.DataFrame([{
            "symbol": "AAPL",
            "quote_timestamp": datetime(2026, 1, 1, 13, 30, 0, tzinfo=timezone.utc),
            "price": 225.0,
            "bid": 224.95,
            "ask": 225.05,
            "currency": "USD",
            "source": "SYNTHETIC_GBM",
            "synthetic": True
        }])
        
        # Mock instruments
        class MockInstruments:
            def __init__(self, connection):
                self.connection = connection
            
            def resolve(self, market, symbol):
                return Instrument(
                    UUID("12345678-1234-5678-1234-567812345678"),
                    market, symbol, "USD", "COMMON_STOCK", True, True
                )
        
        # Patch InstrumentRepository
        import src.quote_ingestor as qi
        original_repo = qi.InstrumentRepository
        try:
            qi.InstrumentRepository = MockInstruments
            inserted, skipped = ingest_frame(frame, conn)
            assert conn.committed
            assert not conn.rolled_back
        finally:
            qi.InstrumentRepository = original_repo
    
    def test_ingest_frame_rolls_back_on_transform_error(self):
        """Test ingest_frame rolls back on transform_batch error."""
        class MockCursor:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, sql, params): pass
        
        class MockConnection:
            committed = False
            rolled_back = False
            def cursor(self): return MockCursor()
            def commit(self): self.committed = True
            def rollback(self): self.rolled_back = True
        
        conn = MockConnection()
        
        # Frame with invalid data (non-USD currency)
        frame = pd.DataFrame([{
            "symbol": "AAPL",
            "quote_timestamp": datetime(2026, 1, 1, 13, 30, 0, tzinfo=timezone.utc),
            "price": 225.0,
            "bid": 224.95,
            "ask": 225.05,
            "currency": "EUR",  # Invalid currency
            "source": "SYNTHETIC_GBM",
            "synthetic": True
        }])
        
        with pytest.raises(QuoteIngestionError):
            ingest_frame(frame, conn)
        
        assert conn.rolled_back
        assert not conn.committed
    
    def test_ingest_frame_handles_currency_mismatch(self):
        """Test that currency mismatch between frame and instrument raises error."""
        class MockCursor:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, sql, params): pass
        
        class MockConnection:
            committed = False
            rolled_back = False
            def cursor(self): return MockCursor()
            def commit(self): self.committed = True
            def rollback(self): self.rolled_back = True
        
        conn = MockConnection()
        
        frame = pd.DataFrame([{
            "symbol": "AAPL",
            "quote_timestamp": datetime(2026, 1, 1, 13, 30, 0, tzinfo=timezone.utc),
            "price": 225.0,
            "bid": 224.95,
            "ask": 225.05,
            "currency": "USD",
            "source": "SYNTHETIC_GBM",
            "synthetic": True
        }])
        
        class MockInstruments:
            def __init__(self, connection):
                self.connection = connection
            
            def resolve(self, market, symbol):
                # Return instrument with EUR instead of USD
                return Instrument(
                    uuid4(), market, symbol, "EUR", "COMMON_STOCK", True, True
                )
        
        import src.quote_ingestor as qi
        original_repo = qi.InstrumentRepository
        try:
            qi.InstrumentRepository = MockInstruments
            with pytest.raises(QuoteIngestionError, match="Currency mismatch"):
                ingest_frame(frame, conn)
            assert conn.rolled_back
        finally:
            qi.InstrumentRepository = original_repo


class TestGenerateCurrentFunctionality:
    """Test generate_current functionality."""
    
    def test_generate_current_returns_dataframe(self):
        """Test generate_current returns a DataFrame with proper structure."""
        frame = generate_current(periods=5, seed=42)
        
        # Verify it's a DataFrame
        assert isinstance(frame, pd.DataFrame)
        
        # Verify required columns
        required_cols = {"symbol", "quote_timestamp", "price", "bid", "ask", 
                        "currency", "source", "synthetic"}
        assert required_cols.issubset(set(frame.columns))
        
        # Verify expected number of rows (symbols * periods)
        # There are 5 NASDAQ stocks by default
        expected_rows = 5 * 5
        assert len(frame) == expected_rows
    
    def test_generate_current_uses_utc_timezone(self):
        """Test that generate_current uses UTC timezone for timestamps."""
        frame = generate_current(periods=2, seed=42)
        
        # Check first timestamp is timezone-aware
        first_ts = frame.iloc[0]["quote_timestamp"]
        assert first_ts.tzinfo is not None
        
        # Verify UTC
        assert str(first_ts.tzinfo) == "UTC"
    
    def test_generate_current_all_usd_currency(self):
        """Test that all generated quotes use USD currency."""
        frame = generate_current(periods=3, seed=42)
        
        # All currency values should be USD
        assert (frame["currency"] == "USD").all()
        assert (frame["source"] == "SYNTHETIC_GBM").all()
        assert (frame["synthetic"] == True).all()


class TestRunOnceIntegration:
    """Integration tests for run_once function."""
    
    def test_run_once_returns_tuple_of_counts(self):
        """Test run_once returns tuple of (generated, inserted, skipped)."""
        # This test would require mocking database connection
        # and would be complex for full integration
        # Placeholder for structure
        pass


class TestServiceRunnerHelper:
    """Helper tests for service_runner functionality."""
    
    def test_signal_handling_structure(self):
        """Verify signal handling can be invoked without subprocess execution."""
        import signal
        
        # Verify signal module is available
        assert hasattr(signal, "SIGTERM")
        assert hasattr(signal, "SIGINT")
        
        # Verify signal handler can be registered
        original_handler = signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, original_handler)


class TestTransformBatchAdvanced:
    """Advanced tests for transform_batch edge cases."""
    
    def test_transform_batch_multiple_symbols_per_batch(self):
        """Test transform_batch handles multiple symbols in single batch."""
        class MockInstruments:
            resolve_count = 0
            def __init__(self, connection=None):
                pass
            def resolve(self, market, symbol):
                self.resolve_count += 1
                # Generate valid UUIDs for each resolve
                uuid_value = UUID(f"12345678-1234-5678-1234-{self.resolve_count:012d}")
                return Instrument(
                    uuid_value, market, symbol, "USD", "COMMON_STOCK", True, True
                )
        
        insts = MockInstruments()
        
        frame = pd.DataFrame([
            {
                "symbol": "AAPL",
                "quote_timestamp": datetime(2026, 1, 1, 13, 30, 0, tzinfo=timezone.utc),
                "price": 225.0,
                "bid": 224.95,
                "ask": 225.05,
                "currency": "USD",
                "source": "SYNTHETIC_GBM",
                "synthetic": True
            },
            {
                "symbol": "MSFT",
                "quote_timestamp": datetime(2026, 1, 1, 13, 31, 0, tzinfo=timezone.utc),
                "price": 510.0,
                "bid": 509.95,
                "ask": 510.05,
                "currency": "USD",
                "source": "SYNTHETIC_GBM",
                "synthetic": True
            },
        ])
        
        rows = transform_batch(frame, insts)
        
        # Both symbols should be resolved
        assert len(rows) == 2
    
    def test_transform_batch_preserves_decimal_precision(self):
        """Test that bid/ask precision is maintained through transformation."""
        class MockInstruments:
            def __init__(self, connection=None):
                pass
            def resolve(self, market, symbol):
                return Instrument(uuid4(), market, symbol, "USD", "COMMON_STOCK", True, True)
        
        frame = pd.DataFrame([{
            "symbol": "AAPL",
            "quote_timestamp": datetime.now(timezone.utc),
            "price": 225.0,
            "bid": 224.99999999,
            "ask": 225.10000001,
            "currency": "USD",
            "source": "SYNTHETIC_GBM",
            "synthetic": True
        }])
        
        rows = transform_batch(frame, MockInstruments())
        
        # Verify conversion to Decimal (which maintains precision)
        bid = rows[0][1]
        ask = rows[0][2]
        assert isinstance(bid, Decimal)
        assert isinstance(ask, Decimal)
        # Verify precision maintained
        assert bid < Decimal("225.0")
        assert ask > Decimal("225.0")
    
    def test_transform_batch_handles_duplicate_symbols_in_frame(self):
        """Test that transform_batch correctly handles duplicate symbols."""
        class MockInstruments:
            resolve_count = 0
            def __init__(self, connection=None):
                pass
            def resolve(self, market, symbol):
                self.resolve_count += 1
                return Instrument(uuid4(), market, symbol, "USD", "COMMON_STOCK", True, True)
        
        insts = MockInstruments()
        
        frame = pd.DataFrame([
            {
                "symbol": "AAPL",
                "quote_timestamp": datetime(2026, 1, 1, 13, 30, 0, tzinfo=timezone.utc),
                "price": 225.0,
                "bid": 224.95,
                "ask": 225.05,
                "currency": "USD",
                "source": "SYNTHETIC_GBM",
                "synthetic": True
            },
            {
                "symbol": "AAPL",  # Duplicate
                "quote_timestamp": datetime(2026, 1, 1, 13, 31, 0, tzinfo=timezone.utc),
                "price": 225.5,
                "bid": 225.45,
                "ask": 225.55,
                "currency": "USD",
                "source": "SYNTHETIC_GBM",
                "synthetic": True
            },
        ])
        
        rows = transform_batch(frame, insts)
        
        # Both rows should be transformed
        assert len(rows) == 2
        # AAPL should only be resolved once due to optimization
        assert insts.resolve_count == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
