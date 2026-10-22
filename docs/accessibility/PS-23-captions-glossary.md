# PS-23: captions, order read-back, glossary and spoken scanning

Voice mode for trading, part one. Everything NextTrade says aloud now goes through one service and
is shown as a caption; Alt+W explains trading words in plain English. Voice commands (PS-22) build
on the same service.

## What was built

- **One voice for the app** (`frontend/src/app/speech.ts`, `SpeechService`). Switch control, the
  order read-back, the audio briefing and Alt+W all speak through it.
  - `speak(text, { priority: 'polite' | 'urgent', source, queue, rate, onStart, onEnd })`.
    Polite speech (the default) never cuts anyone else off: the ring stays quiet while the
    briefing talks. Urgent speech (the order read-back, a briefing or explanation the user asked
    for) stops whatever is playing.
  - `caption`: a signal with the sentence being spoken, or the last one for 4 s after (`''` when
    none). `speaking`: a signal, true while anything is spoken. `cancel(source?)` stops speech.
    `busy(source?)` tells switch control to wait. `setCaptions(show)` turns the strip on or off.
  - `speechService()` returns the app's instance (or a private one in plain unit tests).
- **Caption strip** (`CaptionStrip` in `speech.ts`, styles in `frontend/src/captions.scss`). Large
  white text on black at the bottom centre, `aria-hidden="true"` and ignored by switch control.
  It moves into an open dialog like the switch-control ring, so it shows above the trade review.
  While it shows, the switch-control bar, its keypad, toasts and open dialogs move up by the strip's
  height (`--caption-offset`) instead of being covered.
- **Captions setting.** Settings > Accessibility > Captions, on unless turned off. Saved under
  `captions` in the Accessibility settings store (`nexttrade.accessibility`).
- **"What's this?" glossary** (`frontend/src/app/glossary.ts`). Alt+W explains the item the
  switch-control ring is on; otherwise the focused control or the item under the mouse. Elements
  opt in with `data-glossary="buying-power"` (or a parent does). Items with no entry say "No extra
  help for this item." Listed in the Keyboard Shortcuts dialog on both dashboards. The novice Learn
  hub's glossary now comes from the same list.
- **Spoken keypad.** Keys are read as the ring reaches them ("5", "point", "Delete", "Done"), rows
  as "point to Delete", and what has been typed in words ("5 point 2"). A key no longer says
  "2 selected." over the typed value.

Entries: Limit price, Market order, Time in force (Day, Good till cancelled), Take profit, Stop
loss, Price protection, Buying power, Bid and ask, Order book, Volume, RSI, EMA, VWAP, Total
return, Average cost (plus Share, Dividend and Time horizon for the Learn hub).

Tagged on screen: buying power, total return, average cost, price protection and the market-order
notes and Review buttons on both dashboards, EMA, VWAP and volume on the advanced chart, bid and ask
in the quote panel, and the price-protection settings. Limit price, time in force, take profit,
stop loss, order book and RSI have entries but nothing on screen yet: the tickets are market-only.

## Acceptance criteria

| | Criterion | Notes |
|---|---|---|
| ✅ | Caption strip shows each spoken phrase while it is spoken and for about 4 s after | Switch control, read-back, briefing and Alt+W. Hidden after the speech-time cap even if the browser never reports the end. |
| ✅ | WCAG AA contrast | White on black (21:1); system colours in forced-colours mode. |
| ✅ | Readable at 200% zoom | Sized in rem, wraps, width follows the viewport. Checked at 720 px wide and 2x scale. |
| ✅ | Does not cover the switch-control bar, toasts or trade ticket buttons | They move up above it; open dialogs shrink above it and their buttons stay reachable. |
| ✅ | Strip is `aria-hidden="true"` | Screen readers already announce things their own way. axe: 0 violations. |
| ✅ | Captions setting | Settings > Accessibility > Captions, on by default. |
| ✅ | Polite speech never interrupts; read-back interrupts | `priority: 'urgent'` for the read-back. |
| ➖ | Read-back includes the limit price for limit orders | Not applicable: both tickets place market orders only (PS-31), so there is no limit price to read. |
| ✅ | Editing and reviewing again reads the new details | Both dashboards; covered by unit tests. |
| ✅ | Alt+W speaks and captions a plain-English explanation; "No extra help for this item" otherwise | Alt+W was free (the app uses ?, Alt+B and Alt+S) and is not a Chrome, Edge, Firefox or Safari shortcut. |
| ✅ | Glossary shared with the Learn hub | `LEARN_GLOSSARY`. |
| ✅ | Shortcut in the Keyboard Shortcuts dialog on both dashboards | One shared list. |
| ✅ | Keypad keys spoken as highlighted ("5", "Delete", "Done") | |
| ✅ | Every ring move captioned | When Read each item aloud is on. |
| ❌ | At fast scan speeds speech is cut short, not queued | Partly. Nothing ever queues up: when the ring moves it cuts off what it was saying. But on purpose (PS-19 fix 0d994b1) the ring waits for a sentence to finish before moving, so at 0.7 s a long item slows the ring rather than being cut. Changing that is a product decision. |

## How to demo

1. Settings > Accessibility: Captions is On.
2. Press Alt+S. "Switch control on ..." is spoken and captioned; each ring move is captioned.
3. Open a trade, enter shares with the keypad (each key is read and captioned), choose Review: the
   read-back is spoken and captioned above the Confirm button, cutting off the ring.
4. Confirm. The fill toast appears above the caption strip.
5. Press Alt+S to stop scanning. Hover over Buying power and press Alt+W. Then Tab to a plain
   button and press Alt+W: "No extra help for this item."
6. Press Alt+B: each briefing sentence is captioned as it is read.

## Tests

`frontend/tests/speech.test.mjs` (priorities, queueing, captions and their timing, the strip in
dialogs, the setting, no speech engine), `glossary.test.mjs` (entries, lookup, Alt+W, which item is
explained), keypad speech and `ringed()` in `switch-scan.test.mjs`, re-review read-back in
`advanced-dashboard.test.mjs`, and the Captions card in `accessibility.test.mjs`. Checked on the
live stack with Playwright (novice and advanced accounts, 100% and 200% zoom) and the axe spec.
