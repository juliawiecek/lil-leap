from contextlib import nullcontext
from unittest.mock import Mock
import numpy as np
import pytest
from src import quote_ingestor as ingestor
from src.generate_quotes import generate_price_path, validate_quotes


def test_next_quote_scales_with_previous_price_instead_of_resetting():
    first = ingestor.generate_next({"AAPL": 100}, 5, 42).set_index("symbol")
    second = ingestor.generate_next({"AAPL": 200}, 5, 42).set_index("symbol")
    assert second.loc["AAPL", "price"] == pytest.approx(2 * first.loc["AAPL", "price"], abs=0.0002)
    validate_quotes(second.reset_index())


def test_each_tick_and_restart_resume_the_last_committed_price(monkeypatch):
    persisted = {"AAPL": 1000.0}
    seen = []
    monkeypatch.setattr(ingestor, "connect", lambda: nullcontext(object()))
    monkeypatch.setattr(ingestor.QuoteRepository, "latest_midpoints", lambda _: dict(persisted))
    def ingest(frame, connection):
        seen.append(frame.set_index("symbol").loc["AAPL", "price"])
        persisted.update(dict(zip(frame.symbol, (frame.bid + frame.ask) / 2)))
        return len(frame), 0
    monkeypatch.setattr(ingestor, "ingest_frame", ingest)
    ingestor.run_continuous(5, 42, stop=lambda: len(seen) >= 3, sleep=lambda _: None)
    before_restart = persisted["AAPL"]
    expected = ingestor.generate_next(dict(persisted), 5, 42).set_index("symbol").loc["AAPL", "price"]
    ingestor.run_continuous(5, 42, stop=lambda: len(seen) >= 4, sleep=lambda _: None)
    assert seen[-1] == expected
    assert all(990 < price < 1010 for price in seen)
    assert seen[0] != seen[1]
    assert abs(seen[-1] - before_restart) < 10


def test_random_movement_uses_elapsed_tick_duration():
    fast = generate_price_path(100, 0.125, 0.5, 2, np.random.default_rng(42), step_seconds=5)[-1]
    slow = generate_price_path(100, 0.125, 0.5, 2, np.random.default_rng(42), step_seconds=20)[-1]
    assert np.log(slow / 100) == pytest.approx(2 * np.log(fast / 100))


@pytest.mark.parametrize("interval", [0, -1, float("nan"), float("inf")])
def test_bad_intervals_are_rejected(interval):
    with pytest.raises(ValueError):
        ingestor.run_continuous(interval, 42)
