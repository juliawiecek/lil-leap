import pytest
from src.database import DatabaseConfig, DatabaseConfigurationError

def test_database_config_from_environment(monkeypatch):
    for k,v in {"DB_HOST":"db","DB_PORT":"5432","DB_NAME":"nexttrade","DB_APP_USERNAME":"app_user","DB_APP_PASSWORD":"secret"}.items(): monkeypatch.setenv(k,v)
    config=DatabaseConfig.from_env()
    assert config.host == "db" and config.port == 5432 and config.username == "app_user"
    assert "secret" not in repr(config.connect_kwargs()) or config.connect_kwargs()["password"] == "secret"

def test_missing_database_configuration(monkeypatch):
    for key in ["DB_HOST","DB_NAME","DB_APP_USERNAME","DB_APP_PASSWORD"]: monkeypatch.delenv(key, raising=False)
    with pytest.raises(DatabaseConfigurationError): DatabaseConfig.from_env()
