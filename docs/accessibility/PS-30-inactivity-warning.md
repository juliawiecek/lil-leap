# NEXT-250 / PS-30 — Warn before the inactivity sign-out

[Jira story](https://lilleap.atlassian.net/browse/NEXT-250). WCAG 2.2.1 Timing Adjustable.

## Problem

`SessionKeeper` signed the user out after 10 minutes without pointer, key, wheel or touch
input and went straight to the sign-in page with no warning and no explanation. People
listening to the audio briefing, or scanning slowly with switch control, make no input for
long stretches, so they lost their place mid-task.

## What was built

All of the timing and the dialog live in `shared/session-core`, so NextTrade and Insights get
the same behaviour.

- **`SessionKeeper`** (`src/session-keeper.ts`) raises a warning `SESSION_WARNING_SECONDS`
  (60) before the inactivity sign-out and reports the whole seconds left through a new
  `onWarning` callback, once per change, then `null` when the warning ends. The check now runs
  every second (was 15 s) so the warning appears on time and the countdown moves smoothly; a
  check is a few comparisons and the token is still refreshed only when it is about to expire.
  - `staySignedIn()` counts as activity and immediately renews the access token if it is
    within a minute of expiry, so the server session cannot lapse a moment after the answer.
  - While the warning is up, ordinary input (a key press, a click elsewhere) does **not**
    dismiss it. Otherwise pressing Tab to reach "Sign out", or a switch press that steps the
    scan, would make the dialog vanish mid-choice. Only an answer counts.
  - The inactivity limit (`inactivityMs`) and lead time (`warningMs`) stay configurable; the
    defaults are unchanged at 10 minutes (ADR-NEXT-253).
- **`SessionCoordinator`** exposes the countdown as a `warningSecondsLeft` signal and
  `staySignedIn()`. An inactivity sign-out redirects to `/login?reason=inactive` (with the
  usual `returnUrl`). A second redirect caused by the same sign-out (logging out also reports
  the session as ended) is ignored, so the explained redirect is not replaced by a plain one.
- **`SessionTimeoutWarning`** (`<lil-session-timeout-warning>`, exported from
  `@lilleap/session-core/angular`) is a native `<dialog>` opened with `showModal()`:
  - Title "Still there?", message "For your security, you'll be signed out in 0:42 because
    there's been no activity.", buttons "Stay signed in" and "Sign out" (real `<button>`s).
  - Focus moves to "Stay signed in", so Enter, a click or one switch press keeps the session.
    Escape also keeps it (the dialog's `cancel`), rather than hiding a countdown that is still
    running.
  - `role="alertdialog"` with `aria-labelledby`/`aria-describedby`, so screen readers announce
    the title and message as soon as it opens. The visible "0:42" is hidden from screen
    readers and a visually hidden "42 seconds" is read instead (a clock reads as a time of
    day). The countdown is deliberately not a live region, which would talk every second.
  - An app-provided `SESSION_WARNING_ANNOUNCE` hook stops the briefing and speaks the warning once through the speech coordinator when voice or switch control is on. An assertive live region carries the opening message without narrating each countdown tick. Switch control (`shared/switch-scan.ts`) scans an open modal
    dialog and reads its buttons aloud, so its choices are available to switch users.
  - Styles use NextTrade's theme tokens, then Insights' `--nt-*` tokens, then system colours,
    so the one shared dialog fits both apps and forced-colours mode with no literal colours.
- **Both apps** render the warning in `AppRoot`. NextTrade's sign-in page shows "You were
  signed out after 10 minutes of inactivity. Please sign in again." (`role="alert"`) when it
  opens with `reason=inactive`; Insights shows the same text in its existing message line. The
  text comes from `signedOutMessage()` in session-core so it always quotes the real limit.

## Decision: the audio briefing's repeat options

**Context.** The briefing could repeat every 15, 30 or 60 minutes (`BRIEFING_REPEATS` in
`frontend/src/app/briefing-button.ts`). Listening is not input, so a listener was always
signed out at 10 minutes, before the first repeat could play. The setting could never work.

**Options considered.**

1. *A scheduled briefing counts as activity.* Rejected. It does not fix the existing options
   on its own (the first 15-minute repeat still comes after the 10-minute sign-out), and once
   repeats fit inside the limit it would keep an unattended computer signed in for as long as
   the tab stays open, defeating BR-03 and ADR-NEXT-253.
2. *Lengthen the timeout while repeats are on.* Rejected for the same security reason and
   because the 10-minute limit is shared with the Identity server.
3. *Change the repeat options to fit inside the timeout.* **Chosen.**

**Decision.** The options are now "Only when I ask", "Every 2 minutes" and "Every 5 minutes".
A 10-minute option would race the sign-out, so it is not offered. A repeat still does not
count as activity; when the listener has not touched anything for 9 minutes, the "Still
there?" warning appears (and is announced) and one press keeps them signed in. A test checks
that every option, plus the repeat timer's 30-second check, plays before the warning.

**Migration.** A saved 15, 30 or 60 minute choice becomes "Every 5 minutes", so people who
turned repeats on keep them on. Anything else unrecognised still falls back to "Only when I
ask".

## Tests

- `shared/session-core/tests/session-keeper.test.mjs`: warning at exactly 60 s and not before,
  the full 60…1 countdown then sign-out, stray input ignored during the warning, "Stay signed
  in" renews a due token and restarts the full timeout, a late answer (sleeping laptop) still
  signs out, stopping (Sign out) clears the warning, configurable timings, and the sign-in
  message.
- `shared/session-core/tests/session-timeout-warning.test.mjs`: the dialog opens as a modal
  `alertdialog` with focus on "Stay signed in", shows the clock and spoken countdown, both
  buttons and Escape, and a single explained redirect when nobody answers.
- `frontend/tests/app.test.mjs`, `insights-frontend/tests/login.test.mjs`: the sign-in message.
- `frontend/tests/briefing.test.mjs`: new repeat options, legacy migration, and the timing fit.

Browser check (Playwright with a mocked clock, NextTrade dev server): the warning opens after
9 minutes idle with focus on "Stay signed in" and the countdown moving; Tab reaches "Sign
out" without closing it; Enter on "Stay signed in" keeps the session; with no answer the app
returns to sign-in with the inactivity message.

## Limits

- Each browser tab keeps its own timer, as before this story. Input in one tab does not
  dismiss the warning in another.
- A briefing that is speaking when the warning opens keeps speaking; the screen reader's
  announcement of the warning may overlap it.
- Automated checks do not replace a manual pass with NVDA/JAWS/VoiceOver and a physical switch.
