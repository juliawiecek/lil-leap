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
- `app.test.mjs`: rendered signup/sign-in flows, registration, errors, session
  actions, password visibility, canvas drawing, and lifecycle cleanup.
- `display-components.test.mjs`: rendered dashboard selection, sign-out,
  icons, trade-ticket inputs, and chart period buttons.
- `profile-form.test.mjs`: rendered form prefilling, formatting, validation,
  conditional controls, and step navigation.
- `services.test.mjs`: injected auth session and configured safe error handler.
- `startup.test.mjs`: real entry-point bootstrap and startup failure handling.
- Existing auth, security, and session tests remain in this folder.

`component-helper.mjs` compiles Angular components in memory with the Angular
compiler's JIT transform and TypeScript, preserving signal input/output/query
metadata. Plain TypeScript uses Node's native loader consistently across suites
to retain its native module behavior. The helper also creates component
instances in injection contexts, destroyed after each test.

`dom-helper.mjs` uses Angular TestBed with Happy DOM to render actual templates
and exercise bindings and DOM events. Canvas, animation frames, and dialog APIs
are controlled test doubles. Styles are omitted; these tests do not verify layout,
pixels, real-browser compatibility, or live backend integration. The profile test
compensates for Happy DOM's disabled-fieldset validation limitation while retaining
validation of active controls. Startup tests bootstrap the real application with
its configured providers. Tests run with Node.
