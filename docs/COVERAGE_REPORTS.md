# Test coverage reports

## Historical snapshots

The checked-in [Python test log](../coverage-reports/pytest_output.txt),
[Java report](../coverage-reports/java/index.html) and
[summary](../coverage-reports/SUMMARY.txt) predate NEXT-193. Their 72 Python tests,
320 Java tests and coverage percentages describe that snapshot, not the current
service split. The Java report includes code that has moved out of Insights.
The referenced Python HTML snapshot is absent from the checkout; regenerate it
using the command below instead of relying on the old link.

## Generate current reports

- In each Java service (`nextTrade-orders`, `nextTrade-holdings`, `insights`), run
  `mvn -B clean verify`; open `target/site/jacoco/index.html` for that service.
- In `auth`, run `npm run test:cov`; open `coverage/lcov-report/index.html`.
- In each frontend, run `npm run test:coverage`; see its tests README for reports.
- In `data-pipeline`, follow [Python coverage](../data-pipeline/PYTEST_COVERAGE.md).

Install each component's dependencies first. PostgreSQL-dependent tests require
the disposable database settings described in [service verification](architecture/service-boundaries.md#verification).
Passing unit tests alone does not imply container startup or live API integration
has been checked. The architecture guide records what was actually verified.
