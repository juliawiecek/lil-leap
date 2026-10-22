# PS-20 axe accessibility report

Date: 22 October 2026. Story: PS-20 (NEXT-240), with a reduced scope for demo day.

## How it was measured

- Tool: axe-core 4.14 through `@axe-core/playwright`, with the rule tags `wcag2a`, `wcag2aa`,
  `wcag21a`, `wcag21aa` and `wcag22aa`.
- Spec: `frontend/e2e/accessibility.spec.mjs`, run with `npm run test:a11y` against a running app
  (`npx ng serve --port 4320`, real auth/holdings/order services). It needs `A11Y_PASSWORD` set.
  `A11Y_BASE_URL` and `A11Y_EMAIL` are optional.
- Account: the demo novice account. Viewport 1440×1000, Edge, reduced motion, default colour mode.
- Pages scanned: Sign in; on the novice dashboard, Overview, Portfolio, Activity and Settings; the
  trade dialog (Buy in "Ready to trade"); the Keyboard Shortcuts dialog (`?`).
- Gate: any serious or critical violation fails the run, except the documented exceptions below.
  Full results go to `frontend/test-results/a11y/axe-summary.json`.

## Before and after

Counts are rule violations found on each page, with the number of affected elements in brackets.

| Impact   | Before   | After                          |
|----------|----------|--------------------------------|
| Critical | 1 (1)    | 0                              |
| Serious  | 5 (62)   | 2 (37), both documented exceptions |
| Moderate | 0        | 0                              |
| Minor    | 0        | 0                              |

Elements with serious or critical problems that are not documented exceptions: **63 before, 0 after**.

By page and rule:

| Page                      | Before                                         | After                                     |
|---------------------------|------------------------------------------------|-------------------------------------------|
| Sign in                   | critical `aria-valid-attr-value` (1)            | none                                      |
| Overview                  | serious `label-content-name-mismatch` (11)      | 5 (exception: chart period buttons)       |
| Portfolio                 | serious `label-content-name-mismatch` (7)       | none                                      |
| Activity                  | serious `label-content-name-mismatch` (6)       | none                                      |
| Settings                  | serious `label-content-name-mismatch` (6)       | none                                      |
| Trade dialog              | serious `label-content-name-mismatch` (32)      | 32 (exception: stock options)             |
| Keyboard Shortcuts dialog | could not be opened: `?` did nothing             | none                                      |

Moderate and minor are 0 because these WCAG tags do not include axe's best-practice rules
(`region`, `landmark-*`, `page-has-heading-one`). Those were checked by hand, under "Page structure"
below.

## What was fixed

- **Sign in: critical.** The Sign in and Create account tabs pointed `aria-controls` at
  `#auth-form`, which did not exist. The form now has that id (`app.html`).
- **Price tape: serious, on every page.** Each ticker button showed "AAPL $224.86 0.00%" but was
  named "Apple, $224.86, unchanged", so speech-input users could not say what they saw (WCAG 2.5.3,
  Label in Name). The name is now the visible text in the same order: "AAPL, $224.86, 0.00%"
  (`market-ticker.ts`). Switch control still says "Apple", because everything it reads goes through
  `speakable()`.
- **Holdings table: serious.** The stock button was named "AAPL" but showed "AAPL Apple Inc.". It now
  takes its name from its text, and a space keeps "AAPL" and "Apple Inc." apart
  (`novice-dashboard.html`).
- **`?` shortcut on the novice dashboard.** The document listener that opens Keyboard Shortcuts was
  lost in the merge of PR #190, so `?` did nothing. `StockDashboard` now forwards the key to the novice
  dashboard (`stock-dashboard.ts`). The advanced dashboard still listens for itself.

## Page structure

- **Skip link.** "Skip to main content" is the first focusable element on both dashboards. It stays
  hidden until it gets focus and moves focus to `<main id="main-content" tabindex="-1">`
  (`skip-link.ts`, `stock-dashboard.html`). Switch control leaves it out with `data-scan-ignore`,
  because it already moves group by group.
- **Page titles.** Each route sets its own title, and the title changes on navigation, Back and
  Forward included: "Sign in · NextTrade", "Overview · NextTrade", "Portfolio · NextTrade",
  "Activity · NextTrade", "Settings · NextTrade", "Learn · NextTrade", "Markets · NextTrade",
  "Reset password · NextTrade" and "Page not found · NextTrade" (`page-title.ts`, `app.routes.ts`,
  `app.config.ts`). The dashboards switch pages through the router (`PageState`), so the title always
  matches the page on screen.
- **Landmarks and headings.** On the sign-in page, `<main>` used to wrap the decorative chart while
  the sign-in form sat outside it. The form panel is now `<main>` and the chart is `aria-hidden`.
  The dashboard sidebars are named "Menu", the same name switch control uses. Every scanned page has
  exactly one `h1`, and the spec checks this.

## Still open, and why

1. **Trade dialog stock options (32, serious, `label-content-name-mismatch`).** Each option shows
   "AAPL · Apple Inc." but its `aria-label` is only a spoken name, which the switch control picker
   reads and shows (PS-23, `switch-scan.ts`). Removing the label would change the picker, and
   another teammate is working on that file today. Fix: the picker builds the spoken name itself
   with `speakable()`, and then the option `aria-label` can go. While checking this I also found
   that `spokenStock(q.symbol, q.name)` passes its arguments the wrong way round
   (`spokenCompany` takes name, symbol), so the label is currently "AAPL", not "Apple".
2. **Portfolio chart period buttons (5, serious, `label-content-name-mismatch`).** They show "1D",
   "1W", … but are named "1 day", "1 week", … They are in `portfolio-chart.ts`, which is Julia's file.
   Fix: a name that contains the visible text, for example "1D, 1 day", or no `aria-label` with a
   visually hidden expansion instead.
3. **Advanced dashboard: not scanned.** No advanced demo account was available. The spec scans it
   without gating when `A11Y_ADVANCED_EMAIL` and `A11Y_ADVANCED_PASSWORD` are set. The skip link,
   `main` id, sidebar name and titles are already in place there too.
4. Not in today's scope: real tab semantics for the ticket tabs, 200% and 320px zoom, the iPhone
   Switch Control recording, the NVDA script, the Insights app, and Jenkins changes. The axe spec is
   not in Jenkins yet, because it needs the live services. It is kept out of `npm run test:e2e`.

## For Julia: contrast

axe found **no colour-contrast violations** on the scanned pages in the default colour mode.
Other colour modes were not scanned.

axe could not decide some elements, mostly text over gradient backgrounds, so they need a manual
check. The spec lists them under `contrastToCheck` in `axe-summary.json`:

- **Sign in, text over a gradient:** "Secure connection", the "Welcome back" title and subtitle, the
  Sign in and Create account tabs, the Email and Password labels, "Forgot password?" and the "or"
  divider.
- **Sign in, text over the background image or canvas:** the NextTrade wordmark, "Built for your
  next move", the "Trade what's next." headline, the intro paragraph and the footer.
- **Sign in, the faded ticker tape** ("AAPL / AMZN …"): it is decorative and `aria-hidden`, so a low
  ratio is acceptable there.
- **Dashboard sidebar and top bar, text over a gradient:** the wordmark, the navigation labels,
  "Sign out", the account switcher name and subtitle (`.trigger-text small`) and the market badge.
- **Trade dialog, text on gradient buttons:** the selected Buy/Sell toggle and the Review button.

No component was found using the wrong token, so no colours were changed.
