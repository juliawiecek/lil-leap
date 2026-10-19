# Insights frontend tests

From `insights-frontend/`, run `npm ci` once, then `npm test`. Use Node 24 LTS.

Run `npm run test:coverage` for per-file and overall line, statement, function,
and branch percentages. Open `coverage/index.html` for highlighted source, or
use `coverage/lcov.info` and `coverage/coverage-summary.json` in reporting tools.
The c8 configuration includes all `src/**/*.ts` files, including untested files
at zero coverage, and excludes declaration files. Tests and dependencies are
outside that scope. Inline source maps map compiled components back to TypeScript.
Reports are generated locally and ignored by Git. Each file must reach at least
1% in every metric so completely untested files fail the coverage command. This
is a guard against zero coverage, not a claim that 1% is adequate coverage.

- `routes.test.mjs`: one component per page behind the sign-in and role guards; retired paths redirect.
- `roles.test.mjs`: pages per role, the role guard, safe return URLs and the Clients empty state.
- `rendered-components.test.mjs`: icon and chart rendering, the shell's nav for each role, sign-out,
  and CSV blob creation/download cleanup.
- `live-summary.test.mjs`: the Insights page's totals, hourly chart, top stocks, partial failures and
  the configured API provider.
- `report-generation.test.mjs`: report date ranges, the three CSV reports and their provider.
- `trade-lookup.test.mjs`: order ID checks, loading by URL, readable audit fields, and the record
  checks (exact cents, missing or mismatched settlement parts).
- `insights-chart.test.mjs`: empty/zero series, coordinates, labels, reactive scaling, and compact units.
- `login.test.mjs`, `http-auth.test.mjs`: sign-in, role checks, return URLs and 401 handling.
- `startup.test.mjs`: real entry-point bootstrap and startup failure reporting.

`component-helper.mjs` compiles Angular components in memory with Angular's JIT
transform and TypeScript, preserving signal input/output/query metadata, and
creates instances in injection contexts that are destroyed after each test.
Plain TypeScript uses Node's native loader consistently across suites so coverage
offsets can be merged correctly. Everything runs through Node's built-in runner.

`dom-helper.mjs` uses Angular TestBed and Happy DOM to render real templates and
exercise input bindings and DOM events. Startup tests bootstrap the real app.
Download tests verify CSV bytes, filename, click, and URL cleanup with browser
API doubles. Styles are omitted. These tests do not verify layout, pixels,
real-browser compatibility, actual disk downloads, or live backend integration.
