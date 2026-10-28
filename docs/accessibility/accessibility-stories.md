# Accessibility backlog

6 epics, 42 stories, 123 story points. Import `jira-stories.csv` into Jira (see the end of this file), or read the stories here.

Stories labelled **prototype** already have working code on branch `feat/switch-scan-and-briefing`; the rest are new work.

| Epic | Stories | Points |
|---|---|---|
| Audio market briefing | 6 | 12 |
| Switch control: one-button trading | 7 | 23 |
| Voice mode: read the app aloud in plain language | 11 | 25 |
| Screen reader support across the site | 7 | 22 |
| Charts a screen reader can read and explain | 6 | 25 |
| Colour-blind mode | 5 | 16 |

## Epic: Audio market briefing

A short spoken summary of the market, the portfolio and recent orders, on demand or on a timer, so users can check their account by ear.

### BRIEF-1. Play a spoken market briefing from the top bar

**High · 3 pts · prototype**

_As a trader with low vision, I want to hear a short summary of my account, so that I can check it without reading the screen._

- Prototype built on branch `feat/switch-scan-and-briefing`; this story covers review, polish and merge.
- Briefing button in the top bar of both dashboards, plus Alt+B from anywhere.
- Uses the browser's speech engine, one sentence at a time; the panel shows the text and highlights the sentence being read.

Acceptance criteria:

1. Clicking Briefing or pressing Alt+B opens the panel and starts reading within 2 seconds.
2. The text of every sentence is shown, and the sentence being read is highlighted.
3. Stop, Play again and Close work by mouse and keyboard; Close stops speech.
4. Without a speech engine, the briefing is shown as text with a note saying so.
5. Alt+B is listed in the advanced dashboard's Keyboard Shortcuts dialog.

### BRIEF-2. Briefing content: market, portfolio, biggest mover, orders, buying power

**High · 3 pts · prototype**

_As a trader, I want the briefing to cover what changed, so that it is worth listening to._

- Prototype built on branch `feat/switch-scan-and-briefing`; this story covers review, polish and merge.
- Wording comes from pure functions in `briefing.ts`, unit tested.
- Amounts are rounded for speech ("about $24,500"); companies are said by name ("Apple", not "AAPL").

Acceptance criteria:

1. Greets by time of day and says whether the market is open, with time to close or open.
2. States portfolio value and gain or loss since purchase, in dollars and percent.
3. Names the holding that moved most today, up or down.
4. Reports orders that filled or were rejected since the last briefing (or in the last 24 hours), at most 3, then "The rest are under Orders."
5. Says when prices are delayed.
6. A new user with no holdings hears how much cash they have to invest.

### BRIEF-3. Never read amounts aloud while the balance is hidden

**High · 1 pts · prototype, privacy**

_As a trader in a shared space, I want hidden balances to stay private in the briefing, so that people nearby can't hear them._

- Prototype built on branch `feat/switch-scan-and-briefing`; this story covers review, polish and merge.

Acceptance criteria:

1. When the balance is hidden (novice eye icon or advanced privacy toggle), no dollar amount is spoken or shown in the briefing.
2. The briefing says "Your balance is hidden, so amounts are not read out."
3. Order sentences still name the stock and number of shares, without prices.

### BRIEF-4. Repeat the briefing on a timer and when the market opens or closes

**Medium · 2 pts · prototype**

_As a trader who keeps the app open, I want regular spoken updates, so that I don't have to keep checking._

- Prototype built on branch `feat/switch-scan-and-briefing`; this story covers review, polish and merge.
- Repeat options: only when asked, every 15, 30 or 60 minutes. Voice speed: slow, normal, fast, faster. Saved per browser.

Acceptance criteria:

1. With a repeat chosen, a new briefing plays when the interval has passed since the last one.
2. With a repeat chosen, a briefing plays when the market opens or closes.
3. No automatic briefing plays while one is already playing or loading.
4. Speed and repeat choices are remembered after a reload.

### BRIEF-5. Remember the last briefing time across page reloads

**Low · 1 pts · follow-up**

_As a trader, I want "since your last briefing" to survive a reload, so that I'm not told about the same orders again._

- Today the last-briefing time is kept in memory only, so a reload falls back to "today".
- Store it per account in localStorage (wrapped in try/catch like the other settings).

Acceptance criteria:

1. After a reload, the next briefing reports only orders that changed since the previous briefing.
2. Switching accounts keeps a separate last-briefing time per account.
3. Blocked storage falls back to the last 24 hours without errors.

### BRIEF-6. Let screen reader users get the briefing through their screen reader

**Medium · 2 pts · follow-up, screen-reader**

_As a screen reader user, I want the briefing read by my own screen reader, so that two voices don't talk over each other._

- Add a "Voice" option: Browser voice (default) or My screen reader.
- Screen reader mode skips speechSynthesis and moves focus to the transcript (or announces it through a polite live region).

Acceptance criteria:

1. With "My screen reader" selected, no browser speech plays.
2. NVDA and VoiceOver read the full briefing once, in order, after pressing Alt+B.
3. The setting is remembered.

## Epic: Switch control: one-button trading

Let people who can press only one button (head switch, sip-and-puff, big button or the space bar) use the whole dashboard and place trades.

### SWITCH-1. Turn switch control on in Settings, with speed and switch key

**High · 2 pts · prototype**

_As a trader with limited movement, I want to turn on switch control and set its speed, so that the app moves at a pace I can follow._

- Prototype built on branch `feat/switch-scan-and-briefing`; this story covers review, polish and merge.
- Settings card on both dashboards: On/Off, scan speed (0.7, 1.2, 2 or 3 seconds), switch key (Space or Enter). Saved per browser.

Acceptance criteria:

1. The toggle uses aria-pressed and shows On/Off.
2. Turning it on starts scanning straight away; it stays on after a reload.
3. A status bar shows "Switch control on" and has a Turn off button for helpers using a mouse.
4. Changing the speed or key takes effect without a reload.

### SWITCH-2. Scan the page by groups, with Back and Pause

**High · 5 pts · prototype**

_As a switch user, I want to jump between sections before picking a control, so that reaching anything takes a few presses rather than dozens._

- Prototype built on branch `feat/switch-scan-and-briefing`; this story covers review, polish and merge.
- Groups are marked with `data-scan-group` (Menu, Top bar, Live prices, Portfolio, Ready to trade, …).
- Groups show a dashed ring; controls a solid ring. The ring also moves keyboard focus, so screen readers follow it.

Acceptance criteria:

1. Pressing the switch on a group scans the controls inside it.
2. Every group ends with "Back", and the top level ends with "Pause scanning".
3. After two passes with no press, scanning steps back out of a group.
4. Disabled, hidden and closed-dialog controls are never highlighted.
5. Pressing the switch never types a space or clicks on its own; it still counts as activity for the session timeout.

### SWITCH-3. On-screen keypads for number, text and dropdown fields

**High · 3 pts · prototype**

_As a switch user, I want to enter a share count or search for a stock, so that I'm not blocked by fields that need typing._

- Prototype built on branch `feat/switch-scan-and-briefing`; this story covers review, polish and merge.
- Number pad (0-9, ., Delete), letter pad (A-Z, Space, Delete), and a scanned list for dropdown options, five per row.

Acceptance criteria:

1. Choosing a number or text field opens the right keypad; each key updates the field immediately.
2. The first key replaces a pre-filled value, like a selected field.
3. Done keeps the value; Cancel restores the original.
4. Choosing a dropdown option selects it and closes the list.
5. Afterwards the ring continues from the field that was edited.

### SWITCH-4. Place a complete trade using only the switch

**High · 3 pts · prototype, demo**

_As a switch user, I want to buy and sell shares on my own, so that I don't need someone to help me trade._

- Prototype built on branch `feat/switch-scan-and-briefing`; this story covers review, polish and merge.
- Works in the novice trade dialog and the advanced trade ticket. The ring and keypads are drawn inside an open dialog so they stay visible.

Acceptance criteria:

1. Demo script passes: Ready to trade → Buy → Number of shares → 2 → Done → Review buy → Confirm buy, and the fill toast appears.
2. The review step cannot be skipped.
3. In the advanced ticket, Buy/Sell, Quantity, Order type and Limit price can all be set.
4. Closing the dialog returns scanning to the page.

### SWITCH-5. Keep the scanning position when a page changes

**Medium · 2 pts · prototype**

_As a switch user, I want to stay in the menu after changing pages, so that I don't have to start over each time._

- Prototype built on branch `feat/switch-scan-and-briefing`; this story covers review, polish and merge.
- Changing route re-creates the dashboard; the engine finds the same groups by name and the same control by its label.

Acceptance criteria:

1. After choosing Watchlist in the menu, the ring stays in the menu on Watchlist.
2. If the group no longer exists, scanning returns to the nearest group that does.

### SWITCH-6. Switch control on the sign-in page and in the Insights app

**Low · 5 pts · follow-up**

_As a switch user, I want to sign in and use Insights with my switch, so that I can use the whole product independently._

- Move the engine into `shared/` (next to session-core) so both frontends use it.
- Add a way to turn it on before sign-in (e.g. a link on the sign-in page, or a URL parameter).

Acceptance criteria:

1. Sign-in can be completed with the switch, including the password field via the letter keypad.
2. Insights reports and charts can be reached and opened with the switch.
3. Both apps share one implementation and its tests.

### SWITCH-7. Work with system switch tools (iOS Switch Control, Android and Chromebook Switch Access)

**High · 3 pts · compatibility, demo**

_As a switch user with my own switch software, I want the site to work with it, so that I can use the setup I already know instead of the built-in mode._

- Most switch users already have scanning on their device; the built-in mode is a fallback (e.g. for Windows, which has no full built-in switch scanning) and stays off by default.
- System tools scan the browser's accessibility tree, so this is mostly keyboard and structure work that overlaps the screen reader epic.
- Turn the data-scan-group sections into named regions with headings, so system tools and the built-in mode group the page the same way.

Acceptance criteria:

1. Every action can be done with Tab and Enter alone (how two-switch users often work), in a logical order, with a visible focus ring.
2. Each data-scan-group section is a region with an accessible name and a heading.
3. Toasts with actions stay until dismissed while a keyboard or switch user is focused on them, or their action is also available elsewhere (WCAG 2.2.1).
4. Dialogs move focus in when they open and return it when they close.
5. Click targets are at least 24 by 24 pixels (WCAG 2.5.8), and nothing needs dragging or hovering.
6. A trade can be placed in Safari on an iPhone with Switch Control; a short recording is kept for the presentation.

## Epic: Voice mode: read the app aloud in plain language

An optional read-aloud mode for people with low vision or dyslexia, switch users, and anyone not looking at the screen. It speaks what matters in plain English, with captions and sound cues. It is not a screen reader: screen reader users keep using their own, and voice mode is off by default.

### VOICE-1. Voice mode toggle and settings

**High · 2 pts · new**

_As a user who benefits from hearing the app, I want to turn voice mode on and set it up, so that it speaks the way I need._

- Settings card next to Switch control: On/Off, detail level (Brief or Detailed), sound cues On/Off, voice speed (shared with the audio briefing).
- Reuses the briefing's speech service; saved per browser like the other settings.

Acceptance criteria:

1. Voice mode is off by default and stays as set after a reload.
2. Turning it on says "Voice mode on"; turning it off stops any speech at once.
3. The toggle uses aria-pressed and works by mouse, keyboard and switch control.
4. Changing the voice speed here also changes the briefing's speed, and the other way round.

### VOICE-2. Speak controls and prices in plain language

**High · 3 pts · new**

_As a voice mode user, I want to hear "Apple, 185 dollars, up 1.2 percent" rather than "AAPL dollar 185.16 plus 1.20 percent", so that it is quick to understand._

- Speak the focused control. Reuse the briefing's wording helpers (rounded amounts, company names, "up"/"down" for changes).
- Templates can give an element a hand-written phrase with a data-voice attribute (ticker, holdings, watchlist rows, Buy/Sell).

Acceptance criteria:

1. Ticker, holdings and watchlist items are spoken as company name, rounded price and change in words, e.g. "Apple, 185 dollars, up 1.2 percent. Select to trade."
2. Fields say their label and value ("Number of shares, 2"; empty fields say "empty").
3. Symbols such as $, %, +, ★ and × are never read out literally.
4. Hidden balances are never spoken (same rule as the briefing).

### VOICE-3. Caption bar showing what is being said

**High · 2 pts · demo**

_As a user who is hard of hearing, or in a noisy room, I want to read what voice mode says, so that I don't miss anything._

- A strip at the bottom of the screen shows each spoken phrase as it is said, then fades.
- Also makes the presentation easy to follow for judges.

Acceptance criteria:

1. Every spoken phrase appears in the caption bar while it is spoken and for about 4 seconds after.
2. Captions meet WCAG AA contrast and can be read at 200% zoom.
3. The bar does not cover the switch-control status bar, toasts or the trade ticket buttons.
4. The bar is hidden from screen readers (aria-hidden), since it repeats what is spoken.

### VOICE-4. Sound cues for scanning and order results

**Medium · 2 pts · new**

_As a voice mode user, I want short sounds for common events, so that I get feedback without long speech._

- Web Audio, no sound files: a soft tick when the switch ring moves, a rising chime when an order fills, a low tone when an order is rejected, a click when a keypad opens.

Acceptance criteria:

1. Each event has a distinct sound under half a second long.
2. Sound cues can be turned off on their own, without turning off speech.
3. Audio starts only after the user has interacted with the page (browser rule), and fails silently if Web Audio is unavailable.
4. Every sound has a matching spoken or captioned message, so nothing relies on sound alone.

### VOICE-5. Read back the order before it is placed

**High · 2 pts · demo**

_As a trader using voice mode, I want to hear my order before I confirm it, so that I don't place the wrong trade._

- When Review is pressed on the novice dialog or the advanced ticket, speak a read-back built from the order, e.g. "You're about to buy 2 shares of Apple for about 374 dollars. Press Confirm buy to place the order."

Acceptance criteria:

1. The read-back plays for every reviewed order, on both dashboards, and interrupts other speech.
2. It includes side, number of shares, company name, estimated total and, for limit orders, the limit price.
3. It mentions a closed market or delayed price when the review shows that warning.
4. Editing the order and reviewing again reads the new details.

### VOICE-6. "What's this?" explanations and a trading glossary

**Medium · 3 pts · novice**

_As a novice trader, I want to ask what a control or term means, so that I understand before I use it._

- A shortcut (e.g. Alt+W) explains the focused item; in Detailed mode the explanation follows automatically.
- Glossary entries for Limit price, Market order, Time in force (Day, GTC), Take profit, Stop loss, Price protection, Buying power, Bid/Ask, Order book, Volume, RSI, EMA, VWAP, Total return and Average cost.
- Share glossary wording with Detailed voice mode. The former novice Learn route was intentionally removed.

Acceptance criteria:

1. Pressing the shortcut on a glossary term speaks and captions its plain-English explanation.
2. Items without an entry say "No extra help for this item".
3. The shortcut is listed in the Keyboard Shortcuts dialog and does not clash with browser shortcuts.
4. Explanations are written at a plain-language reading level and reviewed by the team.

### VOICE-7. Important messages first, without a backlog of speech

**Medium · 2 pts · new**

_As a voice mode user, I want urgent messages to interrupt and old ones dropped, so that what I hear is always current._

- Two priorities: urgent (errors, fills, rejections, trade read-back) interrupts; polite (focus moves) waits and is replaced by the newest one.
- Polite speech never interrupts a playing briefing.

Acceptance criteria:

1. Moving quickly through several controls speaks only the last one.
2. An order fill or rejection interrupts anything polite that is playing.
3. The same phrase is not repeated twice in a row within half a second.
4. Escape stops the current speech.

### VOICE-8. Brief and Detailed speech levels

**Low · 2 pts · new**

_As a voice mode user, I want to choose how much is said, so that it is fast once I know the app and helpful while I'm learning._

- Brief: name and value only ("Buy, Apple"). Detailed: adds the kind of control, its state and what it does ("Buy, button. Opens the trade ticket. You have 10,000 dollars to invest.").

Acceptance criteria:

1. Both levels are available in the voice mode settings; Brief is the default.
2. Detailed mode adds role, state (selected, expanded, checked) and the glossary hint when there is one.
3. Switching level takes effect on the next spoken item.

### VOICE-9. Speak a chart summary when a chart is focused

**Medium · 3 pts · charts**

_As a voice mode user, I want a one-sentence summary when I reach a chart, so that I get its meaning without seeing it._

- Shares the summary text with the "Explain this chart" story in the charts epic.
- Until chart data is real (see "Feed charts from real data"), summaries use only real figures, e.g. "Your portfolio is worth about 16,700 dollars, up 422 dollars since you bought."

Acceptance criteria:

1. The novice portfolio chart, allocation donut and advanced price chart can be focused and speak a summary.
2. Summaries update when the period or stock changes.
3. No summary speaks a placeholder or hard-coded number.

### VOICE-10. Read the switch-control ring aloud (auditory scanning)

**High · 3 pts · demo, switch-control**

_As a switch user with low vision, I want to hear where the ring is, so that I can use one button without seeing the screen._

- When voice mode and switch control are both on, each ring move speaks the group or control name ("Trade ticket", "Quantity, 100", "Back") with a soft tick.
- The engine already announces groups and moves focus to controls; voice mode listens to that instead of adding new hooks to every page.

Acceptance criteria:

1. Every ring move is spoken (polite, latest wins) and captioned.
2. Keypad keys are spoken as they are highlighted ("5", "Delete", "Done").
3. At the slowest scan speeds the full phrase is heard before the ring moves on; at fast speeds it is cut short rather than queued.
4. Demo script: place a trade with one button and voice only, with the screen turned away.

### VOICE-11. Stay out of screen readers' way

**Medium · 1 pts · screen-reader**

_As a screen reader user, I want voice mode to keep quiet unless I turn it on, so that it never talks over my own screen reader._

- Voice mode is a read-aloud feature, not a screen reader. Screen reader support is covered by the screen reader epic.

Acceptance criteria:

1. Voice mode is off by default and never turns itself on.
2. Its settings text says it is for people who don't use a screen reader.
3. Caption bar and sound cues add nothing extra to the accessibility tree.
4. With NVDA running and voice mode off, nothing extra is spoken.

## Epic: Screen reader support across the site

NVDA, JAWS and VoiceOver users can find their way around, understand live prices and place trades on both apps.

### SR-1. Page structure: titles, landmarks, headings and a skip link

**High · 3 pts · new**

_As a screen reader user, I want each page to have a clear title, landmarks and headings, so that I know where I am and can jump around._

- Every page is currently titled "NextTrade — Intro & Secure Access", including the dashboards.
- There is no skip link in the NextTrade app.

Acceptance criteria:

1. Each route sets its own document title, e.g. "Portfolio · NextTrade", and it updates on navigation.
2. A "Skip to main content" link is the first focusable element and moves focus to <main>.
3. Each page has one h1, headings go in order, and every panel starts with a heading.
4. Sidebar, header, main and toasts are exposed as landmarks with names.

### SR-2. Real tab semantics for ticket, chart and investment tabs

**Medium · 3 pts · new**

_As a screen reader user, I want tabs announced as tabs, so that I know which view is selected and how to switch._

- The advanced ticket tabs (Trade, Order Book, Options, Alerts) and the positions tabs are plain buttons.

Acceptance criteria:

1. Tab sets use role=tablist/tab/tabpanel with aria-selected and aria-controls.
2. Arrow keys move between tabs; Tab moves into the panel.
3. Toggle groups that are not tabs (periods, Buy/Sell) keep aria-pressed.

### SR-3. Announce trade validation, review and order status

**High · 3 pts · new**

_As a screen reader user, I want to hear errors, the order review and fill status, so that I know what happened to my order._

- Messages appear in <output> elements that are not reliably announced.

Acceptance criteria:

1. Invalid fields get aria-invalid and an error linked with aria-describedby.
2. The review summary is announced when Review is pressed, and focus moves to Confirm.
3. "Order sent", "Order accepted", "Filled" and "Rejected" are announced once each (polite; rejection is assertive).
4. Tested with NVDA + Chrome and VoiceOver + Safari.

### SR-4. Live prices without the noise

**Medium · 5 pts · new**

_As a screen reader user, I want price updates that I choose, so that the ticker doesn't talk over everything or stay silent._

- The ticker updates every few seconds and flashes; screen readers either hear nothing or too much.
- Add "Price watch": pick stocks and a move threshold; one polite live region, rate limited and grouped.

Acceptance criteria:

1. The ticker itself is not a live region.
2. Price watch announces at most one message every 10 seconds, grouping moves ("2 alerts: AAPL up 1.3%, MSFT down 1.1%").
3. A "Pause live updates" control stops the ticker and quote refresh (WCAG 2.2.2).
4. Settings are remembered.

### SR-5. Tables read gains and losses in words

**Medium · 2 pts · new**

_As a screen reader user, I want holdings and orders tables to read clearly, so that I understand gains and losses without seeing the colours._

- Green/red values rely on colour; a leading "+" is sometimes read as "plus" and sometimes skipped.

Acceptance criteria:

1. Header cells use scope; tables have captions.
2. Changes are read as "up 1.2 percent" / "down 3 percent" (visually hidden text) and show ▲/▼.
3. Icon-only buttons in rows have names, e.g. "Trade AAPL".

### SR-6. Automated accessibility checks in CI and a manual screen reader script

**High · 3 pts · testing**

_As the team, we want accessibility checked on every build, so that we don't break it before the final presentation._

- Add @axe-core/playwright to the existing Playwright suite; run it in Jenkins.
- Write a short NVDA test script covering sign-in, briefing, a trade and reading a chart.

Acceptance criteria:

1. Every dashboard page and dialog is scanned; the build fails on serious or critical violations.
2. Current violations are fixed or recorded with a reason.
3. The manual script is in the repo and has been run once before the presentation.

### SR-7. Screen reader pass on the Insights app

**Medium · 3 pts · insights**

_As an analyst who uses a screen reader, I want to read Insights reports, so that I can do my job._

- Same checks as the NextTrade stories: titles, landmarks, headings, tables, live report updates.

Acceptance criteria:

1. Insights passes the axe check with no serious or critical violations.
2. Live report refreshes are announced politely, not on every tick.
3. All report filters have labels and announce result counts.

## Epic: Charts a screen reader can read and explain

Every chart has a plain-English explanation, a data table and keyboard exploration, so that blind and low-vision users get the same information as sighted users.

### CHART-1. Feed charts from real data instead of placeholder values

**Highest · 5 pts · prerequisite**

_As any user, I want charts to show my real data, so that what is described and read aloud is true._

- The novice portfolio chart is drawn from generated sample points (`makePath`).
- The advanced chart's EMA, VWAP and RSI values, the volume label and the exposure ring percentages are hard-coded.
- Use `/api/v1/quotes/history` and the order history. This must land before the explanation stories, or the screen reader will read made-up numbers.

Acceptance criteria:

1. Each chart is built from an array of {time, value} points that the explanation, table and keyboard stories can share.
2. No chart label or indicator shows a hard-coded number.
3. Unit tests cover the data mapping.

### CHART-2. Explain this chart: a plain-English summary for every chart

**High · 5 pts · new**

_As a screen reader user, I want each chart explained in a sentence or two, so that I understand the trend without seeing it._

- Add `describeSeries(points)` in a shared helper: change over the period, high and low with dates, and the overall trend.
- Example: "AAPL rose 4.2% this week, from $175 to $182. Low was Tuesday at $171; high was today."
- For the advanced chart, also mention your trades: "You bought 2 shares on Oct 14 at $182; the price is above your average cost."

Acceptance criteria:

1. Every chart (novice portfolio, advanced price/volume/RSI, sparklines, allocation donut, exposure ring, Insights charts) has role=img and an accessible name plus a summary linked with aria-describedby.
2. An "Explain this chart" button reads the summary (shown as text, and spoken when the briefing voice is on).
3. Summaries update when the period changes and are announced politely.
4. describeSeries is unit tested for rising, falling, flat and empty series.

### CHART-3. Show any chart as a data table

**High · 3 pts · new**

_As a screen reader or keyboard user, I want to read a chart's numbers as a table, so that I can check exact values._

- A "Show as table" toggle under each chart.

Acceptance criteria:

1. The table has a caption, column headers with scope, and the same points as the chart.
2. The toggle uses aria-expanded and keeps focus in place.
3. Large series are grouped (e.g. daily for 1Y) so the table stays readable.

### CHART-4. Explore a chart point by point with the keyboard

**Medium · 5 pts · new**

_As a screen reader user, I want to step through a chart with arrow keys, so that I can find specific moments._

- One focusable chart element; Left/Right move a cursor; the value is announced and drawn on the chart.

Acceptance criteria:

1. Left/Right step one point; Home/End jump to the first/last point; PageUp/PageDown jump 10%.
2. Each step announces date, value and change, e.g. "Oct 14, $182.40, up 1.2%".
3. Trade markers are announced when the cursor reaches them ("You bought 2 shares here").
4. D reads the chart summary, T toggles the table; the keys are listed in the shortcuts dialog.

### CHART-5. Fix Insights chart points hidden from screen readers

**High · 2 pts · insights, bug**

_As an analyst using a screen reader, I want to reach the chart's data points, so that I can read report values._

- `insights-chart.ts` puts focusable circles inside an svg with role="img"; children of role=img are hidden from assistive technology, so the points can be focused but not read.

Acceptance criteria:

1. Points are reachable and announced by NVDA and VoiceOver (or replaced by the keyboard-exploration pattern above).
2. The svg's accessible name describes the chart, not just its title.

### CHART-6. Listen to the chart (sonification)

**Low · 5 pts · stretch, demo**

_As a blind trader, I want to hear the shape of a price chart, so that I can sense trends quickly._

- Stretch goal. Web Audio: price → pitch (log scale 220-880 Hz), time → left-to-right stereo, buy/sell trades as clicks, average cost as a quiet steady tone.

Acceptance criteria:

1. Space plays the whole series in about 3 seconds; pressing again stops it.
2. Respects reduced motion and the pause-live-updates setting; audio starts only after a user action.
3. Value-to-pitch mapping is unit tested.

## Epic: Colour-blind mode

Gains, losses, order status and chart lines can be told apart by people with red-green or blue-yellow colour blindness, using colours that stay distinct and signals that never rely on colour alone.

### COLOR-1. Move colours into shared design tokens

**High · 5 pts · prerequisite**

_As the team, we want every colour defined once, so that a colour-blind palette can be switched on in one place._

- About 390 colours are hard-coded across the SCSS files, plus more inline in templates and components (chart candles, volume bars, sparklines, ticker flashes, toasts, and the new briefing and switch-control components).
- Define CSS custom properties on :root (e.g. --gain, --loss, --warning, --chart-1 to --chart-4, --surface, --text) and use them everywhere, including SVG fill and stroke.

Acceptance criteria:

1. No hex colour remains in component SCSS or templates except in the token file.
2. The app looks the same as before with the default palette (compare screenshots of each page).
3. Chart SVGs take their colours from tokens rather than hard-coded attributes.

### COLOR-2. Colour-blind palette setting

**High · 3 pts · new**

_As a trader with colour blindness, I want a palette I can tell apart, so that I can see at a glance what went up and what went down._

- Add a Colour-blind mode option in Account settings: Off, Red-green safe (blue for gains, orange for losses), Blue-yellow safe.
- Applied as a data attribute on <html> that switches the tokens; saved per browser and applied before the app starts, so the page doesn't flash the old colours.

Acceptance criteria:

1. Each mode changes gains, losses, warnings, toasts, ticker flashes and every chart colour.
2. In each mode, gain and loss colours stay distinct in Coblis or Chrome DevTools simulations of protanopia, deuteranopia and tritanopia.
3. Text in every mode keeps WCAG AA contrast (4.5:1) against its background.
4. The setting can be changed by mouse, keyboard and switch control, and is remembered after a reload.

### COLOR-3. Never use colour alone for gains, losses and status

**High · 3 pts · new**

_As a colour-blind trader, I want arrows, signs and words next to colours, so that I don't misread a loss as a gain in any mode._

- Today ▲/▼ appears in only one place (the advanced portfolio summary); most up/down values rely on green or red text.
- Covers holdings, positions, watchlists, the ticker, order status badges, rejected-order toasts and the market open/closed badge (WCAG 1.4.1).

Acceptance criteria:

1. Every change value shows ▲ or ▼ and a + or − sign, as well as colour.
2. Order and market status show a word or icon (Filled, Rejected, Open, Closed), not just a coloured dot.
3. Ticker flashes add a small arrow, so the direction is clear without the colour.
4. Checked in greyscale: no information is lost.

### COLOR-4. Charts readable without colour

**Medium · 3 pts · charts**

_As a colour-blind trader, I want to tell chart lines and candles apart without relying on colour, so that I can read the technical chart._

- The advanced chart tells EMA 50, EMA 200 and VWAP apart only by blue, purple and yellow; candles and volume bars only by green and red.
- The allocation donut and exposure ring tell segments apart only by colour.

Acceptance criteria:

1. Up candles are hollow and down candles filled (a common trading convention), in every palette.
2. Indicator lines use different dash patterns and are labelled at the line end, as well as in the legend.
3. Donut and ring segments have patterns or direct labels.
4. The chart is still readable in greyscale and in every colour-blind simulation.

### COLOR-5. Support Windows High Contrast and the system contrast setting

**Low · 2 pts · new**

_As a user who relies on Windows High Contrast, I want the app to follow my system colours, so that it stays usable._

- Use @media (forced-colors: active) and (prefers-contrast: more) with system colour keywords (CanvasText, Highlight, and so on).

Acceptance criteria:

1. With Windows High Contrast on, all text, focus rings, buttons and chart lines stay visible.
2. Gains and losses are still told apart by their ▲/▼ arrows and signs.
3. With prefers-contrast: more, borders and focus rings get stronger.

## Importing into Jira

1. In Jira, open your project, then **Settings → Import work items from CSV** (or **Filters → Import issues from CSV**, depending on your Jira version).
2. Upload `jira-stories.csv` (UTF-8, comma separated).
3. Map the columns: **Issue ID** → Issue ID, **Parent ID** → Parent, **Issue Type**, **Summary**, **Description**, **Priority**, **Story Points** (or Story point estimate), and every **Labels** column → Labels. In company-managed projects, also map **Epic Name**.
4. Run the import. Each story is linked to its epic through Parent ID.
