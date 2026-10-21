# Coverage reports (snapshot)

HTML coverage reports for every tested NextTrade component, generated from `main` on
15 October 2026 with the same commands Jenkins runs. Open any `index.html` in a browser
(clone the repo, or right-click → *Open with Live Server* in VS Code) and click through to
a file to see covered lines in green and missed lines in red. GitHub shows the HTML source
rather than the rendered page.

| Component | Tool | Tests | Lines | Branches | Report |
|---|---|---|---|---|---|
| Orders (Spring Boot) | JaCoCo | 311 (+27 Postgres-only) | 86.4% | 89.0% | [orders/index.html](orders/index.html) |
| Holdings (Spring Boot) | JaCoCo | 170 (+27 Postgres-only) | 89.9% | 83.6% | [holdings/index.html](holdings/index.html) |
| Insights (Spring Boot) | JaCoCo | 87 | 89.3% | 89.4% | [insights/index.html](insights/index.html) |
| Auth (NestJS) | Jest + Istanbul | 153 | 91.6% | 81.9% | [auth/index.html](auth/index.html) |
| NextTrade UI (Angular) | c8 | 212 | 96.4% | 91.6% | [nexttrade-ui/index.html](nexttrade-ui/index.html) |
| Insights UI (Angular) | c8 | 48 | 100% | 96.9% | [insights-ui/index.html](insights-ui/index.html) |
| Session package (shared Angular/TS) | c8 | 70 | 98.6% | 94.3% | [session-core/index.html](session-core/index.html) |
| **All code** | | **1,136** | **94.7%** (10,780 / 11,380) | **90.4%** (2,627 / 2,906) | |

Every component is above the 70% coverage target. "Postgres-only" tests need a disposable
database and are skipped by a plain `mvn verify`; Jenkins runs them in a separate stage, and
they are not included in these figures (or in what SonarQube reads).

How to regenerate a report, and what SonarQube counts as coverage:
[docs/coverage/README.md](../docs/coverage/README.md).
