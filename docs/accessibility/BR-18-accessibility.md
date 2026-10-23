# BR-18: Accessibility as NextTrade's differentiating capability

Why NextTrade invests in accessibility, who it helps, and what is built. Replaces NEXT-132.
Stories: PS-17 to PS-30 (NEXT-237 to NEXT-250); full backlog in [accessibility-stories.md](accessibility-stories.md).

## Who it helps

| Group | Barrier in a typical trading app | What NextTrade offers |
|---|---|---|
| People who are blind or have low vision | Prices, charts and order results are visual | Audio market briefing, screen reader support, charts described in words |
| People who can press only one button (head switch, sip-and-puff, a large button) | Every action needs a mouse or precise taps | Switch control: one button scans the page and places a trade |
| People with colour blindness | Gains and losses are told apart only by green and red | Colour-blind palette, plus arrows and signs on every change |
| Keyboard-only users | Hidden shortcuts, mouse-only controls | Every action by keyboard, with a shortcuts list on both dashboards (press `?`) |
| Everyone else | Busy, driving, on a bad screen | The same features: a spoken summary, clearer gain and loss markers |

More than 1 in 4 US adults report a disability (CDC), and about 1 in 12 men and 1 in 200 women
have colour vision deficiency. The second group of users matters too: features built for access,
like a spoken briefing, help any trader who cannot look at the screen. That is why we count the
reach as everyone, with about a quarter of users depending on it.

## Why it adds value

- **Retention and trust.** People who depend on assistive technology stay with platforms that work
  for them; switching brokers is costly for them, so a working platform keeps them.
- **Competitive difference.** Mainstream brokerages cover screen readers at best; one-button
  trading and spoken briefings are rare in retail trading apps.
- **Lower legal risk.** US courts and the Department of Justice treat public-facing websites as
  covered by the ADA, and WCAG 2.2 AA is the standard regulators and courts look to. Building to it
  now costs less than retrofitting after a complaint.
- **Better product for all.** Clear structure, keyboard access and non-colour signals make the app
  easier for every user, and the automated checks (PS-20) keep it that way.

## What is built

Everything is in Settings > Accessibility on both dashboards, starts off, and is remembered in the
browser (one settings store, PS-17).

| Story | Feature | Status |
|---|---|---|
| PS-17 | Accessibility section in Settings; Keyboard Shortcuts on both dashboards, also opened with `?` | Built |
| PS-18 | Audio market briefing (Alt+B): market, portfolio, biggest mover, recent orders | Prototype, merging |
| PS-19 | Switch control: scan the page with one button; keypads for number and text fields | Prototype, merging |
| PS-20 | Page structure and an automated axe accessibility check | Planned |
| PS-23 | Switch control reads each item aloud; order read-back | Read-aloud prototyped |
| PS-25 | Every chart explained in words and as a table | Planned (portfolio chart already has a summary) |
| PS-27, PS-28 | Colour-blind palette; arrows and signs so colour is never the only clue | In progress |
| PS-30 | Warning before the inactivity sign-out | Planned |

Update the Status column as stories merge.

## How we check it

- Unit tests for every feature's logic (wording, scanning, settings parsing, shortcuts).
- Automated axe scan of the dashboards (PS-20): no serious or critical violations.
- The demo script in [demo-script.md](demo-script.md), run end to end before the presentation.
