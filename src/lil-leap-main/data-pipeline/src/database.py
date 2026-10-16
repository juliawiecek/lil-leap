"""Central PostgreSQL configuration and connection factory."""
from __future__ import annotations
from dataclasses import dataclass
import os
from typing import Callable, Any
import psycopg

class DatabaseConfigurationError(RuntimeError): pass
class DatabaseUnavailableError(RuntimeError): pass

@dataclass(frozen=True)
class DatabaseConfig:
    host: str
    port: int
    name: str
    username: str
    password: str

    @classmethod
    def from_env(cls) -> "DatabaseConfig":
        values = {
            "host": os.getenv("DB_HOST", ""),
            "name": os.getenv("DB_NAME", ""),
            "username": os.getenv("DB_APP_USERNAME", ""),
            "password": os.getenv("DB_APP_PASSWORD", ""),
        }
        missing = [key for key, value in values.items() if not value]
        if missing:
            raise DatabaseConfigurationError("Missing database configuration: " + ", ".join(missing))
        try:
            port = int(os.getenv("DB_PORT", "5432"))
        except ValueError as exc:
            raise DatabaseConfigurationError("DB_PORT must be an integer") from exc
        return cls(values["host"], port, values["name"], values["username"], values["password"])

    def connect_kwargs(self) -> dict[str, Any]:
        return {"host": self.host, "port": self.port, "dbname": self.name,
                "user": self.username, "password": self.password,
                "connect_timeout": 5}


def connect(config: DatabaseConfig | None = None):
    cfg = config or DatabaseConfig.from_env()
    try:
        return psycopg.connect(**cfg.connect_kwargs())
    except psycopg.Error as exc:
        raise DatabaseUnavailableError("PostgreSQL is unavailable") from exc
