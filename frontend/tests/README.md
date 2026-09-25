# Frontend tests

From `frontend/`, run `npm ci` once, then `npm test`. Use Node 24 LTS.
`npm run test:ci` runs the same tests and writes a JUnit report.

- `novice-dashboard.test.mjs`: search, watchlists, order validation, buying power,
  fills, holdings, weighted cost, and revalidation at confirmation.
- `advanced-dashboard.test.mjs`: screeners, ticket pricing, validation, bracket
  prices, fees, market/limit orders, cancellation, and price alerts.
- `novice-learn.test.mjs`: quiz completion, stored progress, topic selection,
  unavailable storage, and compound-growth calculations.
- `investor-profile.test.mjs`: conditional fields, review masking, and emitted answers.
- Existing auth, security, and session tests remain in this folder.

`component-helper.mjs` compiles app TypeScript decorators in memory using the
existing TypeScript dependency. It creates component instances with real Angular
signals and an injection context, destroyed after each test. Tests use Node's
built-in runner; no new packages or application changes are required.

These are component **logic** tests. They do not render templates or test DOM
events, browser form validation, layout, or end-to-end API integration.
