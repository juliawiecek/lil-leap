# Code coverage

How to generate the coverage report for every tested NextTrade service, and the figures
from the latest run. Each command runs the service's full test suite and writes an HTML
report; open its `index.html` in a browser and click through to a file to see covered lines
in green and missed lines in red.

## Latest figures (15 October 2026)

Generated from `main` with the commands below; every test passed. The HTML for each run is
checked in under [coverage-reports/](../../coverage-reports/README.md).

| Service | Tool | Tests | Lines | Branches | Report |
|---|---|---|---|---|---|
| Orders (Spring Boot) | JaCoCo 0.8.13 | 311 | 86.4% | 89.0% | [open](../../coverage-reports/orders/index.html) |
| Holdings (Spring Boot) | JaCoCo 0.8.13 | 170 | 89.9% | 83.6% | [open](../../coverage-reports/holdings/index.html) |
| Insights (Spring Boot) | JaCoCo 0.8.13 | 87 | 89.3% | 89.4% | [open](../../coverage-reports/insights/index.html) |
| Auth (NestJS) | Jest + Istanbul | 153 | 91.6% | 81.9% | [open](../../coverage-reports/auth/index.html) |
| NextTrade UI (Angular) | c8 | 212 | 96.4% | 91.6% | [open](../../coverage-reports/nexttrade-ui/index.html) |
| Insights UI (Angular) | c8 | 48 | 100% | 96.9% | [open](../../coverage-reports/insights-ui/index.html) |
| Session package (shared) | c8 | 70 | 98.6% | 94.3% | [open](../../coverage-reports/session-core/index.html) |
| Quote service (Python data pipeline) | pytest-cov | 85 | 92.3% | 82.3% | [open](../../coverage-reports/data-pipeline/index.html) |
| **All code** | | **1,136** | **94.7%** | **90.4%** | |

The Spring Boot figures come from `mvn clean verify`, which skips the opt-in PostgreSQL tests
(27 each in orders and holdings). Jenkins runs those in its own stage; they are not part of
these figures or of what SonarQube reads.

## What SonarQube counts as coverage

SonarQube does not run tests. It reads the coverage files each tool writes and combines them
for every file listed under `sonar.sources` in [sonar-project.properties](../../sonar-project.properties):

| Language | Report SonarQube reads |
|---|---|
| Java | `*/target/site/jacoco/sonar-jacoco.xml` (JaCoCo XML, path-fixed by `scripts/prepare_sonar_coverage.py`) |
| TypeScript / JavaScript | `auth`, `frontend`, `insights-frontend` and `shared/session-core` `coverage/lcov.info` |
| Python | `data-pipeline/coverage.xml` |

Its **Coverage** metric mixes lines and branches: (covered lines + covered branch outcomes) ÷
(coverable lines + branch outcomes). By that measure the whole codebase is at about 93.8%.
A Quality Gate usually checks **coverage on new code** (the "Sonar way" default is at least
80% of lines changed since the reference point), so a new class with no tests can fail the
gate even when overall coverage is high. Files with no report at all count as 0% covered.
Jenkins runs pytest without `--cov-branch`, so SonarQube sees Python line coverage only.

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
method coverage per package and class. Jenkins archives all three reports on every build.

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
