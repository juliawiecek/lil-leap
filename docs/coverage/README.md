# Code coverage

How to generate the coverage report for every tested NextTrade service, and the figures
from the latest run. Each command runs the service's full test suite and writes an HTML
report; open its `index.html` in a browser and click through to a file to see covered lines
in green and missed lines in red.

## Historical figures before service consolidation

These incoming measurements describe the earlier service layout on 2026-10-01. They are not current NEXT-193 coverage claims. Regenerate reports with the commands below; opt-in PostgreSQL tests need their database settings to avoid skips.

| Service | Tool | Tests | Lines | Branches |
|---|---|---|---|---|
| Orders (Spring Boot) | JaCoCo 0.8.13 | 74 | 70.1% | 56.9% |
| Holdings (Spring Boot) | JaCoCo 0.8.13 | 10 | 68.4% | 24.3% |
| Insights (Spring Boot) | JaCoCo 0.8.13 | 166 | 73.0% | 44.7% |
| Auth (NestJS) | Jest + Istanbul | 88 | 90.2% | 80.0% |
| Quote service (Python data pipeline) | pytest-cov | 72 | 80.0% (statements) | – |
| NextTrade UI (Angular) | c8 | 97 | 98.4% | 92.3% |
| Insights UI (Angular) | c8 | 24 | 100% | 97.1% |

## Generating a report

Run each command from the repository root.

| Service | Command | Report |
|---|---|---|
| Orders | `cd nextTrade-orders && mvn clean verify` | `nextTrade-orders/target/site/jacoco/index.html` |
| Holdings | `cd nextTrade-holdings && mvn clean verify` | `nextTrade-holdings/target/site/jacoco/index.html` |
| Insights | `cd insights && mvn clean verify` | `insights/target/site/jacoco/index.html` |
| Auth | `cd auth && npm ci && npm run test:cov` | `auth/coverage/lcov-report/index.html` |
| Quote service | see [below](#quote-service-pytest-cov) | `data-pipeline/htmlcov/index.html` |
| NextTrade UI | `cd frontend && npm ci && npm run test:coverage` | `frontend/coverage/index.html` |
| Insights UI | `cd insights-frontend && npm ci && npm run test:coverage` | `insights-frontend/coverage/index.html` |

### Spring Boot services (JaCoCo)

Requires JDK 17 or newer and Maven 3.9+ (CI uses JDK 21). JaCoCo's report runs in Maven's `verify` phase, so
`mvn test` alone does not produce it. The Spring Boot reports also show instruction and
method coverage per package and class. Jenkins archives the orders and holdings reports on
every build.

### Auth service (Jest)

Requires Node.js 24. The figures cover the unit tests; the end-to-end suite
(`npm run test:e2e`) needs a running database and is not included.

### Quote service (pytest-cov)

Requires Python 3.12.

```bash
cd data-pipeline
python -m pip install -r requirements-coverage.txt
python -m pytest --cov=src --cov-report=term-missing --cov-report=html:htmlcov
```

Jenkins runs the same command and archives the report. More detail:
[data-pipeline/PYTEST_COVERAGE.md](../../data-pipeline/PYTEST_COVERAGE.md).

### Angular apps (c8)

Requires Node.js 24. The report's `tmp/` folder holds raw data and can be ignored.
