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

- `dashboard.test.mjs`: navigation, dates, intersecting filters, metrics,
  investigation search, client details, role-based navigation, reset, and all
  three CSV report types. Downloads are mocked so tests do not open a browser.
- `insights-chart.test.mjs`: empty/zero series, coordinates, labels, reactive
  scaling, and compact units. Writable signals supply chart input values.
- `insights-data.test.mjs`: existing data aggregation and CSV escaping tests.
- `rendered-components.test.mjs`: icon bindings, rendered chart empty states,
  focus/hover readouts, navigation, and CSV blob creation/download cleanup.
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
