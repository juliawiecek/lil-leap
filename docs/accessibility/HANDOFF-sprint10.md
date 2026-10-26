# Sprint 10 accessibility: handoff

Work started on 26 Oct 2026 from `main` at `f999ae3`. Each remaining gap is on its own branch, and each branch is pushed after every step, so pick up from whatever is on GitHub.

## Branches

| Branch | Stories | What it does |
|---|---|---|
| `a11y/ps21-screen-readers` | PS-21, toast fixes | Merges `feature/PS-21-screen-reader-v2` onto current main. Order steps announced once each, Price watch, Pause live updates, table captions, "My screen reader" briefing option. Toasts pause on focus and have a 24 px close button. |
| `a11y/ps22-26-voice-and-charts` | PS-22, PS-26, PS-24/25/28 chart fixes | Merges `feature/PS-22-voice-mode` and then `feature/PS-26-chart-keyboard` (they share the sound-cue commits). Voice levels and priorities, sound cues, chart step announcements, D/T/Space, sonification, NVDA script. Donut patterns, zero guards, hidden-balance masking. |
| `a11y/ps23-captions-glossary` | PS-23 | Caption strip that observes `speechCoordinator`, Alt+W glossary (no Learn page), checks of read-back and spoken scanning, demo-script updates. |
| `a11y/ps29-insights-signin` | PS-29, show-password, switch picker | Switch engine moved to `shared/` (the first commit is a pure rename), switch control on the sign-in pages, Insights chart and structure fixes, Insights axe check. |
| `a11y/audit-fixes` | PS-17/18/20/30 gaps, docs | Spoken inactivity warning, briefing "under Activity" and a 1.5 s timeout, registration focus bug, real tabs, named regions, wider axe coverage, doc corrections. |

## Merge order

1. Merge the five branches into one integration branch off `main`, in this order: `audit-fixes`, `ps21`, `ps22-26`, `ps23`, `ps29`. The PS-29 rename of `switch-scan.ts` goes last, so git's rename detection carries the other branches' edits across.
2. Conflicts to expect: `novice-dashboard.*`, `advanced-dashboard.*`, `keyboard-shortcuts.ts`, `accessibility-settings.ts`, `site-accessibility.ts`, `switch-scan.ts`, `shared/assistive-controller.ts`, `toasts.ts`. Keep both sides. The changes are additive.
3. After the PS-29 merge, re-point any `./switch-scan` imports that the other branches added.
4. Run `npm test` and `npm run build` in both `frontend/` and `insights-frontend/`. If the browsers are installed, also run `npm run test:a11y` in `frontend/`.

## Do not

- Merge `revert-207-feat/chart-accessibility`: it would undo Julia's chart accessibility PR.
- Force-push `feat/chart-accessibility`.
- Run `npm ci` in `frontend/` while `ng serve` is running on port 4300.

## Jira

Until the integration branch is merged, PS-23 and PS-26 are not fully on main, even though Jira marks them Done. PS-24 looks finished on main apart from the fixes on the `ps22-26` branch. The novice Learn page was removed on purpose in `e1ec012`; decide whether PS-38 ("Learn page unreachable") is closed as won't do.
