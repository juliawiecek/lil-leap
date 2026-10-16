"""Flask API for the NextTrade synthetic US-equity quote feed."""

from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, jsonify

from src.quote_provider import (
    CachedQuoteService,
    CsvQuoteProvider,
    QuoteNotFoundError,
    PostgresQuoteProvider,
    QuoteSourceError,
)

APP_IMPORT_NAME = __name__
HOST_ENV_VAR = "HOST"
DEFAULT_SERVER_HOST = "127.0.0.1"
PORT_ENV_VAR = "PORT"
DEFAULT_PORT = 8083


def _port_from_env() -> int:
    """Read the HTTP port from the environment with a safe integer fallback."""
    return int(os.getenv(PORT_ENV_VAR, str(DEFAULT_PORT)))


def _host_from_env() -> str:
    """Read bind host from the environment and default to localhost."""
    return os.getenv(HOST_ENV_VAR, DEFAULT_SERVER_HOST)


def create_app(
    provider: object | None = None,
    service: CachedQuoteService | None = None,
) -> Flask:
    """Create and configure the quote API application."""
    # This service is read-only (GET endpoints only) and does not use cookie form auth.
    app = Flask(APP_IMPORT_NAME)  # NOSONAR

    if service is None:
        if provider is not None:
            active_provider = provider
        elif os.getenv("QUOTE_PROVIDER", "postgres").strip().lower() == "csv":
            active_provider = CsvQuoteProvider(
                csv_path=Path(os.getenv("QUOTE_CSV_PATH", "output/quotes.csv")),
                replay_interval_seconds=float(os.getenv("QUOTE_REPLAY_INTERVAL_SECONDS", "5")),
                periods=int(os.getenv("QUOTE_PERIODS", "390")),
                seed=int(os.getenv("QUOTE_SEED", "42")),
            )
        else:
            active_provider = PostgresQuoteProvider()
        service = CachedQuoteService(
            provider=active_provider,
            cache_seconds=float(os.getenv("QUOTE_CACHE_SECONDS", "5")),
        )

    app.config["QUOTE_SERVICE"] = service

    @app.get("/health")
    def health() -> tuple[object, int]:
        """Return a simple process health response."""
        return jsonify({"status": "UP"}), 200

    @app.get("/api/v1/quotes/<symbol>")
    def get_quote(symbol: str) -> tuple[object, int]:
        """Return the current cached quote for a supported symbol."""
        try:
            payload = app.config["QUOTE_SERVICE"].get_quote(symbol)
            return jsonify(payload), 200
        except QuoteNotFoundError as exc:
            return jsonify(
                {
                    "code": "QUOTE_NOT_FOUND",
                    "message": str(exc),
                    "symbol": symbol.upper().strip(),
                }
            ), 404
        except QuoteSourceError:
            app.logger.exception("Quote source retrieval failed")
            return jsonify(
                {
                    "code": "QUOTE_SOURCE_UNAVAILABLE",
                    "message": "Quote data is temporarily unavailable",
                }
            ), 503
        except Exception:
            app.logger.exception("Unexpected quote retrieval failure")
            return jsonify(
                {
                    "code": "QUOTE_RETRIEVAL_FAILED",
                    "message": "The quote could not be retrieved",
                }
            ), 500

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host=_host_from_env(), port=_port_from_env())

