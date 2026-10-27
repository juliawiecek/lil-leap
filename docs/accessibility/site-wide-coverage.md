# Site-wide accessibility coverage

Audit baseline: `8748da5`, 22 October 2026, before implementation. Both Angular applications
use standalone components, native controls/dialogs, custom SVG charts, and no Angular CDK.
The trading app already has PS-20 titles/skip links, PS-19 scanning/queued speech, PS-23
order read-back, PS-25 chart alternatives, keyboard chart inspection (PS-26 behavior),
PS-27 palettes and PS-28 non-colour/forced-colour cues. PS-24 is partially represented by
chart speech/preferences; there is no general focus/hover voice mode. No functioning
feature will be replaced by a parallel screen reader.

## Coverage matrix

K = keyboard/focus; S = native semantics/errors/status; V = optional focus/hover/on-demand
speech; L = selected visual assistance/reflow. Every row requires K/S/V/L. Authentication
and role guards, backend authorization, and explicit financial confirmations are preserved.

| Page/component | Existing foundation | Gaps to address / shared coverage |
|---|---|---|
| Trading `/login`: sign-in, signup, forgot/reset | Native labelled fields, password rules, mode focus, status | Tablist keys; associated field errors; all-page tools; no password speech |
| Investor profile, four steps/review | Fieldsets, labels, native validation, step-heading focus | Programmatic error descriptions; private details excluded from automatic hover |
| Trading Overview, both tiers | Named navigation, main/h1, skip link, native buttons | Route focus, concise card reading, visual assistance |
| Portfolio, both tiers | Holdings/positions table, financial change text | Scrollable table keyboard access, row/column headers, retained focus |
| Activity (orders/history redirects) | Filter buttons/dates, statuses, cancellation confirmation | Avoid full-list live announcements on polling; labelled errors/read sections |
| Markets (watchlist/screeners redirects) | Search, stock selection, heat map, sector alternatives | Search arrow/Escape behavior; tablist navigation; concise quote reading |
| Settings/profile, both tiers | Accessibility store, briefing, scanner, palettes | Shared voice/visual settings; immediate application and saved restoration |
| 404 | Main/h1 and return link | Global tools and route focus |
| Stock details/embedded stock dashboard | Price/change text, chart keys, retry/status | Read current stock; focus/hover metadata; no tick-by-tick speech |
| Buy/Sell ticket + review dialogs | Native controls/dialog, explicit review/confirm, spoken read-back | Form-error association; dialog return focus; coordinated speech priority |
| Accounts/add/transfer/review dialogs | Native buttons/dialog, transfer confirmation | Escape and return focus; sensitive-region hover exclusion; linked errors |
| Notifications, briefing, account dropdown | Native triggers, expanded states | Named controlled regions, Escape/outside dismissal and focus restoration |
| Watchlist/list/auth tabs | Roles/selected states, native buttons | Roving Tab stop, arrows/Home/End, preserve native activation |
| Toasts and service failures | Polite order updates/alerts | Keep status delivery independent of optional voice; no live price narration |
| All trading charts/allocation/exposure/heat maps | PS-25/26 alternatives and exploration | One speech coordinator; no duplicate focus narration; preserve scanner hooks |
| Insights `/login` | Native labels, alert, password visibility | Native constraints, skip link, global tools |
| Insights `/insights` | H1, KPIs, chart/ranking alternatives | Route title/focus, shared optional voice/visual assistance |
| Insights `/clients` | Filters, sort buttons, aria-sort, links/pagination, caption | Scroll region and column scopes; reading without loading private details by hover |
| Insights `/clients/:id` overview/orders | Account heading, tabs/panels, captioned tables | Tab keys, loading/error heading, private details excluded from automatic hover |
| Insights `/reports` | Labelled date validation, CSV buttons, exports table | Distinct export action names; column scopes; tools/low vision |
| Insights `/trades`, `/trades/:id` (Operations) | Search, record details, trail table, errors | Route title/focus, private-region policy, column scopes |
| Insights shell/mobile navigation | Role-aware links, skip link, main | Correct fragment handling, Escape/restoration, hidden-nav keyboard isolation |
| Insights `/settings` | New guarded Settings page for Analyst and Operations | Shared voice/visual preferences; keyboard access and browser persistence |
| Shared settings/tools, all routes | New integration with existing preferences | Native dialog, immediate stop/pause/read actions, feature detection, all input modes |

## Implementation and verification record

The floating Accessibility launcher is shown only on sign-in and public account-access
screens. Inside either application, preferences are accessed through Settings. Trading reuses
its existing Accessibility section; Insights has a Settings navigation entry and guarded page.
Alt + Shift + A opens the login tools before sign-in and navigates to Settings inside the app.
Reading and Stop speech shortcuts continue to work without a floating control.

This file is updated with actual results after implementation. Automated checks cannot certify
all WCAG 2.2 AA criteria or every browser/assistive-technology combination. Manual NVDA/JAWS,
VoiceOver, TalkBack, physical switch, magnification and actual 200%/400% browser zoom checks
must be reported separately from automated viewport/reflow checks.

Sources: [WCAG 2.2](https://www.w3.org/TR/WCAG22/),
[APG tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/),
[APG modal dialogs](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
