# Screen reader test script: NVDA + Chrome

About 10 minutes on the novice dashboard. It checks the screen reader acceptance criteria for
PS-20 (page structure) and PS-21 (trades, live prices and tables), and is the manual script
SR-6 asks for. Anyone on the team can run it; you do not need to know NVDA already.

Steps marked **(after PS-21)** only pass once PS-21 is merged; until then, note what you heard
and move on. Steps marked **(after PS-25)** need the chart branch. Everything else should pass on
`main` today. A quick VoiceOver + Safari version is at the end.

## Before you start (one time, about 5 minutes)

1. Download NVDA from <https://www.nvaccess.org/download/> and install it (or run it portable).
   It is free.
2. Start NVDA (Ctrl+Alt+N). You will hear "NVDA started".
3. Turn on the Speech Viewer, so you can see everything NVDA says and copy it into the run log:
   press **NVDA+N**, then **Tools > Speech Viewer**. Keep its window to one side.
4. The **NVDA key** is Insert (or Caps Lock if you chose that). Keys you will use:

   | Key | What it does |
   |---|---|
   | Tab / Shift+Tab | Next / previous control |
   | H, Shift+H | Next / previous heading; **1** jumps to the next level-1 heading |
   | D, Shift+D | Next / previous landmark (navigation, main, regions) |
   | T | Next table |
   | Ctrl+Alt+arrows | Move between table cells; NVDA reads the column header as you move |
   | NVDA+T | Read the page title |
   | NVDA+Space | Switch between browse mode (reading) and focus mode (typing) |
   | NVDA+F7 | List of all headings, landmarks and links |
   | Ctrl | Stop speaking |

5. Have ready: the app running (`http://localhost:4300`), a novice test account that owns at
   least one stock and has some buying power, and Chrome with the sound on. Use the demo novice
   account if you are not sure which one.

## The script

### Sign in (PS-20)

1. Open `http://localhost:4300/login` in Chrome and wait for the sign-in form (a few seconds).
   Expected: NVDA reads the page title **"Sign in · NextTrade"** (press NVDA+T to hear it again).
2. Press Tab until you reach the email box.
   Expected: **"Email address, edit"**. Tab again: **"Password, edit, protected"**. Each field
   says its label, not just "edit".
3. Tab to the button after the password.
   Expected: **"Show password, button"**. Press Enter, then Shift+Tab back to the password box.
   Expected: the password is now read as plain text, and the button is now **"Hide password"**.
4. Type a wrong password and press Enter (or Tab to **"Continue securely"** and press it).
   Expected: NVDA announces the error without you moving, e.g. **"Invalid email or password, or
   sign-in is locked…"**. Focus stays on the form.
5. Sign in with the right password.
   Expected: the dashboard opens and the title changes to **"Overview · NextTrade"**.

### Skip link, page titles and structure (PS-20)

6. Press Ctrl+Home, then Tab once.
   Expected: the first thing reached is **"Skip to main content, link"**, and it appears on
   screen. Press Enter. Expected: focus moves into the main content (NVDA reads the greeting
   heading or the start of the page content), not back to the menu.
7. Press **D** a few times.
   Expected: you hear landmarks with names, including **"Menu, complementary"**, **"Main
   navigation, navigation"**, **"main"** and **"Portfolio performance, region"**.
8. Press **1**, then **H** several times.
   Expected: one level-1 heading (the greeting, e.g. **"Good afternoon, Sam, heading level 1"**),
   then level-2 headings in order such as **"Your investments"**, **"Ready to trade?"** and
   **"Watchlist"**. No heading level is skipped.
9. Press D until **"Main navigation"**, then Tab to **Portfolio** and press Enter.
   Expected: NVDA+T reads **"Portfolio · NextTrade"**, the Portfolio button is read as
   **"current page"**, and the level-1 heading is now **"Portfolio"**.

### A trade on the novice dashboard (PS-20, PS-21)

10. Go back to **Overview**. Press H until **"Ready to trade?"**, then Tab to **Buy** and press
    Enter.
    Expected: a dialog opens and NVDA reads its title, e.g. **"Buy AAPL, dialog"**. Focus is
    inside the dialog.
11. Tab through the dialog.
    Expected: **"Stock, combo box"**, then **"Buy, toggle button, pressed"** and **"Sell, toggle
    button, not pressed"**, then **"Number of shares, edit"**.
12. **(after PS-21)** Type **0** in Number of shares and press **Review buy**.
    Expected: **"Enter a whole number of shares greater than zero."** is announced, focus goes
    back to the field, and the field is read as **"invalid entry"** with that error.
    Before PS-21, Chrome shows its own bubble instead ("Value must be greater than or equal to
    1"), which NVDA may not read; write down what you heard.
13. Type **1** and press **Review buy**.
    Expected: the review line appears, e.g. **"Buy 1 AAPL · about $224.86 · fills at up to
    $…"**. **(after PS-21)** focus moves to **"Confirm buy, button"** and NVDA reads the review
    line with it. Before PS-21 the line may not be read; press the Down arrow to read it.
14. Press **Confirm buy**.
    Expected: you hear the order's progress, ending with the fill. **(after PS-21)** **"Order
    sent: buy 1 share of Apple."**, then **"Order accepted: … Waiting for it to fill."** if it
    waits, then **"Filled: bought 1 share of Apple at $…"**, each exactly once. A rejected order
    interrupts straight away with **"Rejected: your order to buy … was not filled."** and the
    reason. Before PS-21 you may hear the fill twice (dialog and toast) or not at all; write
    down which.
15. Press Escape to close the dialog.
    Expected: focus returns to the **Buy** button you started from.

### The audio briefing (PS-18, PS-21)

16. Press **Alt+B**.
    Expected: the briefing panel opens and the briefing is read aloud (market, portfolio, biggest
    mover, recent orders, buying power), including the order you just placed. Press Ctrl to
    silence NVDA if both talk at once.
17. **(after PS-21)** In **Settings > Accessibility > Audio briefing**, set **Voice** to **"My
    screen reader"** and press Alt+B again.
    Expected: NVDA reads the briefing itself (no second voice), one sentence after another.

### A chart and its data (PS-20, PS-25)

18. On **Overview**, Tab to the portfolio chart.
    Expected: NVDA reads a summary, e.g. **"Portfolio value past month: from $… to $…, up 1.25%.
    Use the left and right arrow keys to move along the line."**
19. Press NVDA+Space (focus mode), then the Left and Right arrows, Home and End.
    Expected: the point moves and the big value above the chart changes to that point. Write
    down whether NVDA reads each point; reading them aloud is CHART-4 and may not be built yet.
    Press NVDA+Space again to go back to browse mode.
20. Tab to the period buttons under the chart (**1D**, **1W**, **1M** …) and press **1W**.
    Expected: **"1W, toggle button, pressed"**, then a summary such as **"1 week. A week ago you
    had $…. Now you have $…, up 0.42 percent."**
21. **(after PS-25)** Tab to **"Explain this chart"** and press it.
    Expected: a plain-English summary is read. Then **"Show as table"**: a data table appears.
    Press T to reach it: **"… data table, table with N rows and 2 columns"**.

### Tables (PS-21)

22. Go to **Portfolio** and press **T**.
    Expected: **"Holdings, table"** with its row and column count.
23. Move into the table with Ctrl+Alt+Down, then Ctrl+Alt+Right along a row.
    Expected: each cell is read with its column header (**"Value · Shares"**, **"Avg. price"**,
    **"Today"**, **"Total return"**). **(after PS-21)** changes are read in words, e.g. **"up 1.20
    percent"** or **"down 3.00 percent"**, not "plus" or "minus".
24. **(after PS-21)** On the price ticker, press **Pause live updates** (or the setting under
    **Settings > Accessibility > Live prices**).
    Expected: **"Pause live updates, toggle button, pressed"**, prices stop moving, and NVDA does
    not read price changes on its own.

### The inactivity warning (PS-30)

25. Do this last. Leave the keyboard and mouse alone for 9 minutes (fill in the run log on
    another device meanwhile).
    Expected: NVDA announces **"Still there?"** and **"For your security, you'll be signed out in
    … seconds because there's been no activity."** Focus is on **"Stay signed in, button"**. The
    countdown is not read every second.
26. Press Enter.
    Expected: the dialog closes and you are still signed in. (If you let it run out instead, the
    sign-in page says **"You were signed out after 10 minutes of inactivity. Please sign in
    again."**)

## Quick variant: VoiceOver + Safari (5 steps, about 5 minutes)

First, in Safari open **Settings > Advanced** and tick **"Press Tab to highlight each item on a
webpage"**. Turn VoiceOver on with **Cmd+F5**. **VO** means Control+Option.

1. **Sign in.** Open the sign-in page and Tab through the form.
   Expected: **"Email address, edit text"**, **"Password, secure edit text"**, **"Show password,
   button"**. A wrong password is announced without moving focus.
2. **Structure.** After signing in, press Tab once: **"Skip to main content, link"**. Press **VO+U**
   and use Left/Right to the Headings and Landmarks lists.
   Expected: one heading level 1, named landmarks (Menu, Main navigation, main).
3. **A trade.** Ready to trade? > **Buy**, type 1 in Number of shares, **Review buy**, **Confirm
   buy**.
   Expected: the review line is read; **(after PS-21)** focus moves to Confirm buy and "Order
   sent", "Order accepted" and "Filled" are each read once.
4. **Chart and table.** Tab to the portfolio chart.
   Expected: its summary is read. Press **VO+Cmd+T** to jump to the Holdings table, then **VO+arrow
   keys** across a row: each cell is read with its column header.
5. **Briefing.** Tab to **"Briefing, button"** in the top bar and press it (VO+Space).
   Expected: the briefing is read aloud and the panel shows the text. Also try Option+B: on a
   Mac it types "∫" instead, so the shortcut may do nothing; record it if so.

## If something goes wrong

- **NVDA says nothing when you type.** You are in browse mode: press NVDA+Space to switch to
  focus mode.
- **Alt+B or a letter key does nothing.** NVDA may be in browse mode, where letters move between
  headings and landmarks. Press NVDA+Space and try again.
- **Two voices at once.** The audio briefing uses the browser's own voice unless its Voice
  setting is "My screen reader" (after PS-21). Press Ctrl to silence NVDA.
- **Signed out mid-test.** The inactivity limit is 10 minutes; sign in again and carry on.

## Run log

Write down anything that did not match "Expected", with the Speech Viewer text.

| Date | Who | Screen reader + browser | Branch / commit | Result | Notes |
|---|---|---|---|---|---|
| | | NVDA + Chrome | | | |
| | | VoiceOver + Safari | | | |
