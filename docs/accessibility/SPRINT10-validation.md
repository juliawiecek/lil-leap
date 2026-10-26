# Sprint 10 accessibility integration validation

Validated on 26 October 2026 on `a11y/sprint10-integration`, based on main `f999ae3`.
The branches were merged in order: audit fixes, PS-21, PS-22/26, PS-23, then PS-29.
The switch-engine migration has a separate rename/import-only commit (`214e1a2`).

## Automated results

| Check | Result |
| --- | --- |
| `npm test` in frontend | 608 passed, 0 failed |
| `npm test` in insights-frontend | 100 passed, 0 failed |
| `npm test` in shared/session-core | 96 passed, 0 failed |
| `npm run build` in frontend | Passed; existing stylesheet size warnings remain |
| `npm run build` in insights-frontend | Passed |
| `npm run test:a11y` in frontend, Edge | 18 passed, 18 skipped, 0 failed |

Sixteen browser skips are the intentionally inapplicable app/project combinations. Two are optional real-service audits that require account credentials. The eighteen applicable mocked browser flows include both sign-in switch toggles; every trading and Insights route; chart alternatives; order review, allocation, exposure, shortcuts, add-account and transfer dialogs; registration, recovery and reset; and narrow-screen reflow. Audits assert zero violations for the selected WCAG 2.2 AA rule tags. The 320px Insights screenshot was inspected.

Regression coverage includes independent hover/focus toast holds, full timer restart after modal closure, toast actions inside the top modal, 24px targets, keyboard chart freezing, voice persistence/levels/speed/priorities, caption/glossary behavior, interrupting read-back and edit/review, fast/slow scan timing, email/password keypad sign-in, hidden balance/cost/gain redaction, paused REST polling, session warning speech and registration focus.

## Story evidence and remaining acceptance checks

| Story | Implemented | Not verified here / remaining manual acceptance |
| --- | --- | --- |
| [PS-21 / NEXT-241](https://lilleap.atlassian.net/browse/NEXT-241) | Order announcements and focus, Price watch/pause, tables, screen-reader briefing, toast audit | AC4 and AC13: NVDA + Chrome and VoiceOver + Safari, including complete briefing order/timing |
| [PS-22 / NEXT-242](https://lilleap.atlassian.net/browse/NEXT-242) | One pressed-state Voice mode button, shared speed, Brief/Detailed with glossary hints, priorities, private values and sound cues | AC21: real NVDA run with Voice mode off; local-voice intelligibility and sound perception remain manual |
| [PS-23 / NEXT-243](https://lilleap.atlassian.net/browse/NEXT-243) | Captions, interrupting/edited order read-back, independent Alt+W glossary, spoken keypads and Fast scan behavior | AC2/3: manual 200% zoom/overlay review; AC12: team wording review; AC16: screen-away one-button trade demo. AC6's limit-price clause is unexercised because the current tickets expose market orders only |
| [PS-26 / NEXT-246](https://lilleap.atlassian.net/browse/NEXT-246) | Point navigation/announcements, D/T/Space, sonification and pitch tests, displayed-series parity | Actual screen-reader and audio listening review remains manual. Explicit Space playback is permitted while reduced motion/live updates are paused; those settings prevent automatic playback |
| [PS-29 / NEXT-249](https://lilleap.atlassian.net/browse/NEXT-249) | Shared switch implementation, both sign-in pages, full private keypad, Insights charts/structure/filter counts, allocation alternatives and axe | Physical switch checks for AC1/2 and NVDA/VoiceOver checks for AC7 remain manual; automated engine/keypad and browser checks pass |

The removed novice Learn route is intentionally absent; the glossary is independent and shared with Detailed speech. Price watch retains its documented limitation while a modal makes the main region inaccessible; order announcements and toast actions move into the modal. Automated checks do not establish complete WCAG conformance.

## Reproduce

Run the two app test suites and builds, then `npm run test:a11y` from frontend. Build session-core first through the app pretest hooks. For standalone session-core tests without installing, link its node_modules to frontend/node_modules, then run its test script. No npm ci or backend credentials are needed for the mocked browser suite. Set A11Y_PASSWORD and the optional advanced-account variables to include the live-service checks.
