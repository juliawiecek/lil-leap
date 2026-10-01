# Sprint 7 strict scorecard

Initial ledger: 2026-10-01 UTC. This is the single scoring source of truth.
Every category starts at zero until all gates have current, reproducible evidence.
Historical/pre-consolidation reports do not score. FAIL includes pending/unverified.

The supplied PO checklist lists **13 base categories (65 points) plus Kafka (5 extra)**,
and calls their combined total 70. The readiness plan's 70 base + 5 target is not
supported by the source checklist. No invented fourteenth category is awarded.

| Category | Points | Pass/Fail | Evidence path | Command | Owner | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Story points / completeness | 0/5 | FAIL | `docs/review/po-sprint7-evidence.md#stories` | `git log --oneline` | Product owner | Require current backlog, BR/AC/code traceability and closure |
| Java unit tests | 0/5 | FAIL | `docs/review/po-sprint7-evidence.md#java` | `mvn -B clean verify` in all three Java modules | Java maintainers | Require zero failures and zero critical skips |
| Angular spec tests | 0/5 | FAIL | `docs/review/po-sprint7-evidence.md#angular` | `npm run test:coverage` in both clients | UI maintainers | Require current component behavior/spec evidence |
| Spring Boot / REST API tests | 0/5 | FAIL | `docs/review/po-sprint7-evidence.md#rest` | `mvn -B clean verify` in all Java modules | Java maintainers | Require controller, authorization, validation and service behavior |
| Cross-component integration | 0/5 | FAIL | `docs/review/integration-evidence.md` | `bash scripts/auth-integration-test.sh` | Service maintainers | All six services; positive and rejection flows |
| Coverage >=60% | 0/5 | FAIL | `docs/review/po-sprint7-evidence.md#coverage` | See evidence runbook | All maintainers | Every scored component must meet threshold with fresh reports |
| Code checks / Javadocs / lint | 0/5 | FAIL | `docs/review/po-sprint7-evidence.md#quality` | `python scripts/generate_javadocs.py` | All maintainers | Require strict doclint, generated HTML and relevant static checks |
| Feature branch PRs | 0/5 | FAIL | `docs/review/po-sprint7-evidence.md#prs` | `git log --merges --oneline` | Feature owners | Local history alone cannot prove current remote PR status |
| Updated README | 0/5 | FAIL | `README.md` | See documentation validation in evidence | Documentation maintainers | Architecture, ERD, current commands and coverage workflow |
| Jenkins main run / containers | 0/5 | FAIL | `docs/review/po-sprint7-evidence.md#ci` | `docker compose ps; docker ps` | CI maintainers | Actual main Jenkins success and running containers required |
| Security | 0/5 | FAIL | `docs/review/po-sprint7-evidence.md#security` | See ecosystem audits in evidence | Security maintainers | Code/PII/secrets/dependencies plus role and reporting isolation |
| Architecture | 0/5 | FAIL | `docs/review/architecture-alignment.md` | `python scripts/test_gateway.py --nginx <nginx>` | Service maintainers | Validate both supplied diagrams and document deviations |
| UML and ERD | 0/5 | FAIL | `docs/review/architecture-alignment.md` | See diagram validation in evidence | Data / service maintainers | Present, linked and consistent with current schema/code |
| Kafka (extra) | 0/5 | FAIL / not attempted | `kafka/README.md` | `docker compose -f docker-compose.yml -f docker-compose.kafka.yml config -q` | Service maintainers | Broker scaffolding alone earns no points; optional, out of scope |

**Verified total: 0/65 base + 0/5 extra.** Pending execution; not a final assessment.
