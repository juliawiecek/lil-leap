# Data Pipeline (Python) — Local Development

## Local `.env`
Create `data-pipeline/.env` with:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nexttrade
DB_APP_USERNAME=app_user
DB_APP_PASSWORD=my_app_password

QUOTE_PROVIDER=postgres
QUOTE_INTERVAL_SECONDS=5
QUOTE_PERIODS=10
QUOTE_SEED=42
QUOTE_RETENTION_DAYS=0
PORT=8083
```

The package loads `./.env` automatically when `src` is imported.

## Run
```cmd
cd data-pipeline
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m src.service_runner
```

## Verify
- Health: `http://localhost:8083/health`
- Logs should show quote ingestion and the Flask server starting.

