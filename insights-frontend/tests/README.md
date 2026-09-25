# Insights frontend tests

From `insights-frontend/`, run `npm ci` once, then `npm test`. Use Node 24 LTS.

- `dashboard.test.mjs`: navigation, dates, intersecting filters, metrics,
  investigation search, client details, role-based navigation, reset, and all
  three CSV report types. Downloads are mocked so tests do not open a browser.
- `insights-chart.test.mjs`: empty/zero series, coordinates, labels, reactive
  scaling, and compact units. Writable signals supply chart input values.
- `insights-data.test.mjs`: existing data aggregation and CSV escaping tests.

`component-helper.mjs` compiles app TypeScript decorators in memory using the
existing TypeScript dependency and creates instances in an Angular injection
context, destroyed after each test. Everything runs through Node's built-in runner.

These are component **logic** tests. They do not render templates or verify
Angular input binding, SVG rendering, pointer/keyboard events, or browser downloads.
