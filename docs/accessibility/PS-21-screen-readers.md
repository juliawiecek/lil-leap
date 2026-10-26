# NEXT-241 / PS-21 — Screen readers hear trades, live prices and tables clearly

[Jira story](https://lilleap.atlassian.net/browse/NEXT-241). WCAG 1.3.1 Info and Relationships, 2.2.2 Pause, Stop, Hide,
3.3.1 Error Identification, 4.1.3 Status Messages. Applies to both the novice and advanced dashboards.

## Who it helps

People using NVDA, JAWS or VoiceOver. Before this change the order dialog, toasts, activity list, ticker and market
badge were all live regions, so one order could be read three times while live prices chattered every few seconds.
Field errors came from browser bubbles that were not linked to their field, and the review summary was not read
when Review was pressed. People who find moving content distracting (WCAG 2.2.2) had no way to stop the ticker.

## What was built

- **`live-announcer.ts`**: one polite and one assertive region, created up front at the end of the page and
  moved into an open modal dialog while one is open. Each message is cleared and rewritten, so repeated words are
  still heard. A message that arrives before the last one was placed joins it, so "Order sent" and a fast
  "Filled" are both read. `history` keeps the wording for tests.
- **`order-announcements.ts`**: "Order sent", "Order accepted", "Filled" (polite) and "Rejected" (assertive,
  with the reason), each said **once** per order however often its status is polled. The trade dialog's
  `<output>`, the toasts, the activity list (now `aria-busy` while it refreshes) and the market badge are no longer
  live regions.
- **Trade forms** (`novice-dashboard.*`, `advanced-ticket.html`, `advanced-dashboard.ts`): `novalidate` plus
  `data-a11y-app-validation`, so the app's message is the one shown and read. An invalid share count gets
  `aria-invalid="true"` and `aria-describedby` pointing at its visible error, and focus moves to the field. If the field
  is already focused, or there is no field to fix (no live price), the error is announced assertively. Pressing
  Review announces the summary once, using company names, and focus moves to Confirm.
- **Live prices** (`live-prices.ts`, `live-prices-settings.ts`, `price-watch.ts`, `market-ticker.ts`,
  `market-feed.service.ts`, `stock-dashboard.component.ts`):
  - The ticker is a labelled region with `aria-live="off"`. Nothing in it is read out on its own.
  - **Pause live updates** (in Settings > Accessibility, "Live prices", and also on the ticker) stops the scrolling
    tape, the shared quote refresh and the advanced stock chart. The prices already shown stay on screen, and
    resuming fetches new prices at once.
  - **Price watch**: pick stocks and a minimum move (0.1–5%). A single polite region says at most one message
    every 10 seconds and groups moves, for example "2 alerts: Apple up 1.3 percent, Microsoft down 1.1 percent."
- **Tables**: every table has a caption and `scope="col"` headers. `describeChange` reads moves as "up 1.2 percent" or
  "down 3 percent" (no trailing zeros; money keeps its cents) while the screen shows ▲ +1.20% or ▼ −3.00%. Row
  buttons are named, for example "Trade AAPL", and toast close buttons say "Dismiss …".
- **Briefing voice** (`briefing-button.ts`, `briefing-settings.ts`): a Voice option on the briefing card and in
  Settings, either Browser voice (the default) or My screen reader. With My screen reader the browser's speech engine
  is never used. On Alt+B or the button, the whole briefing goes to the polite region as one message, in order,
  and the transcript stays on screen. Switching to My screen reader mid-briefing stops the browser voice.
- **Settings are remembered** in the `livePrices` and `briefing` sections of the PS-17 accessibility store.
  Every `localStorage` access is wrapped in try/catch. With storage blocked, the defaults are used and changes still
  apply for the visit.

## How to test

```powershell
cd frontend
npm test            # tests/screen-reader.test.mjs holds the PS-21 tests
npm run build
```

By hand, with NVDA (Chrome/Firefox) or VoiceOver (Safari):

1. Open Trade, enter 0 shares and press Review. The field is announced as invalid with its error. Enter 1 and press
   Review: the summary is read once and focus lands on Confirm. Confirm: you hear "Order sent", then
   "Order accepted" and "Filled" once each. A rejection interrupts.
2. Settings > Accessibility > Live prices: turn on Price watch for two stocks at 0.1%. Alerts come at most every
   10 seconds, grouped. Turn on Pause live updates: the ticker, prices and stock chart stop moving.
3. Briefing card: set Voice to My screen reader and press Alt+B. Only your screen reader reads the briefing, once,
   in order.
4. Reload: the choices above are kept.

## Limits

- **Manual NVDA, JAWS and VoiceOver testing is still required.** The automated tests check the markup, the wording
  and when announcements happen, not how a real screen reader times or interrupts them.
- Pause live updates holds the advanced chart and suspends its REST quote/open/history refreshes after the first price; resuming restarts them on the next tick.
- The Price watch region sits in `<main>`. While a modal dialog (such as Trade) is open, Chrome hides it, so
  alerts during that time are not heard. Order announcements move into the dialog and are heard.
- The switch-control voice (`data-speak`, `spokenChange`) still says "up 0.40 percent". Only screen reader text
  changed.

Toast audit: hover/focus pause dismissal independently; open modals hold timers and closing restarts each full duration. Toast actions move inside the top modal and have 24px minimum targets.
