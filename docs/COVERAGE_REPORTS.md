# Test coverage reports

## Current snapshot

[coverage-reports/](../coverage-reports/README.md) holds the HTML report for every tested
component, generated from `main` on 15 October 2026: 1,136 tests, 94.7% of lines and 90.4% of
branches covered overall. The figures and what SonarQube counts are in
[docs/coverage](coverage/README.md).

## Generate current reports

- In each Java service (`nextTrade-orders`, `nextTrade-holdings`, `insights`), run
  `mvn -B clean verify`; open `target/site/jacoco/index.html` for that service.
- In `auth`, run `npm run test:cov`; open `coverage/lcov-report/index.html`.
- In each frontend, run `npm run test:coverage`; see its tests README for reports.

Install each component's dependencies first. PostgreSQL-dependent tests require
the disposable database settings described in [service verification](architecture/service-boundaries.md#verification).
Passing unit tests alone does not imply container startup or live API integration
has been checked. The architecture guide records what was actually verified.
