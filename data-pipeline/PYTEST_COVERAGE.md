# Python Test Coverage

The data pipeline uses `pytest` and `pytest-cov` to measure statement coverage for `src/`.

## Local validation

From `data-pipeline/`:

```bash
python -m pip install -r requirements-coverage.txt
python -m pytest -v --cov=src --cov-report=term-missing --cov-report=html:htmlcov --cov-report=xml:coverage.xml
```

Open the HTML report from Windows Git Bash:

```bash
start htmlcov/index.html
```

PowerShell equivalent:

```powershell
Start-Process .\htmlcov\index.html
```

Generated files are local build artifacts and must not be committed:

- `.coverage`
- `coverage.xml`
- `htmlcov/`

The measured baseline on September 17, 2026 was 81% statement coverage: `app.py` 87%, `generate_quotes.py` 70%, and `quote_provider.py` 87%. No failure threshold is added in this initial reporting change. Coverage shows which statements ran, not whether behavior is correct.

Jenkins runs the Python tests in Python 3.12, prints the terminal report, and archives `coverage.xml` plus the complete `htmlcov/` directory. HTML Publisher is not required.
