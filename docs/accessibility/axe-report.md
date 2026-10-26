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
- Gate: any serious or critical violation fails the run. There are no exceptions.
  Full results go to `frontend/test-results/a11y/axe-summary.json`.

## Before and after

Counts are rule violations found on each page, with the number of affected elements in brackets.

| Impact   | Before   | After |
|----------|----------|-------|
| Critical | 1 (1)    | 0     |
| Serious  | 5 (62)   | 0     |
| Moderate | 0        | 0     |
| Minor    | 0        | 0     |

Elements with serious or critical problems on the sign-in page and the novice dashboard:
**63 before, 0 after.**

By page and rule:

| Page                      | Before                                         | After |
|---------------------------|------------------------------------------------|-------|
| Sign in                   | critical `aria-valid-attr-value` (1)            | none  |
| Overview                  | serious `label-content-name-mismatch` (11)      | none  |
| Portfolio                 | serious `label-content-name-mismatch` (7)       | none  |
| Activity                  | serious `label-content-name-mismatch` (6)       | none  |
| Settings                  | serious `label-content-name-mismatch` (6)       | none  |
| Trade dialog              | serious `label-content-name-mismatch` (32)      | none  |
| Keyboard Shortcuts dialog | could not be opened: `?` did nothing             | none  |

Moderate and minor are 0 because these WCAG tags do not include axe's best-practice rules
(`region`, `landmark-*`, `page-has-heading-one`). Those were checked by hand, under "Page structure"
below.

## What was fixed

- **Sign in: critical.** The Sign in and Create account tabs pointed `aria-controls` at
  `#auth-form`, which did not exist. The form now has that id (`app.html`).
- **Names that match the screen, words for the voice kept apart: serious, on every page.** Buttons
  were named in words meant for switch control's voice ("Apple, $224.86, unchanged" on a button
  showing "AAPL $224.86 0.00%", "1 day" on "1D", "Apple" on "AAPL · Apple Inc."), so speech-input
  users could not say what they saw (WCAG 2.5.3, Label in Name). Now each accessible name is the
  visible text, and the spoken words live in a separate `data-speak` attribute that switch control
  reads first (`switch-scan.ts` `spokenItem` and its dropdown picker). So the price tape is named
  "AAPL, $224.86, 0.00%" but heard as "Apple, $224.86, unchanged"; the chart buttons are named "1D"
  but heard as "1 day"; the trade dialog's stock options and the holdings buttons are heard as
  "Apple" (`market-ticker.ts`, `portfolio-chart.ts`, `novice-dashboard.html`). This also fixed
  `spokenStock(symbol, name)` being called with its arguments the wrong way round.
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
  "Activity · NextTrade", "Settings · NextTrade", "Markets · NextTrade",
  "Reset password · NextTrade" and "Page not found · NextTrade" (`page-title.ts`, `app.routes.ts`,
  `app.config.ts`). The dashboards switch pages through the router (`PageState`), so the title always
  matches the page on screen.
- **Landmarks and headings.** On the sign-in page, `<main>` used to wrap the decorative chart while
  the sign-in form sat outside it. The form panel is now `<main>` and the chart is `aria-hidden`.
  The dashboard sidebars are named "Menu", the same name switch control uses. Every scanned page has
  exactly one `h1`, and the spec checks this.

## Still open, and why

1. **Advanced dashboard (scanned, not gating; it is still being built).** With
   `A11Y_ADVANCED_EMAIL` and `A11Y_ADVANCED_PASSWORD` set, the spec scans Overview, Portfolio,
   Activity, Markets and Settings without failing the run. Each page has one serious finding,
   `color-contrast` (see "For Julia" below), and Overview also has `scrollable-region-focusable`: the
   sector list scrolls but cannot be reached by keyboard (needs `tabindex="0"` and a name). The skip
   link, `main` id, sidebar name and titles are already in place there.
2. Not in today's scope: real tab semantics for the ticket tabs, 200% and 320px zoom, the iPhone
   Switch Control recording, the NVDA script, the Insights app, and Jenkins changes. The axe spec is
   not in Jenkins yet, because it needs the live services. It is kept out of `npm run test:e2e`.

## For Julia: contrast

axe found **no colour-contrast violations** on the sign-in page and the novice dashboard in the
default colour mode. Other colour modes were not scanned.

On the **advanced dashboard** it found two failing pairs, both just under the 4.5:1 minimum for
small text:

- `#7a7a7a` on `#111111` (4.39:1): the summary panel's small labels (`.summary-metrics span`,
  `.main-value small`) and the ticket note (`.ticket-note`). `#7a7a7a` is `--text-tone-04`.
- `#62748e` on `#0b1210` (3.97:1): the price chart's window label, hint and footer
  (`.chart-window`, `.chart-hint`, the chart `footer`).

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
