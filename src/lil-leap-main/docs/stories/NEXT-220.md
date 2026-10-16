# NEXT-220 - Restore the session and page after browser refresh

Both NextTrade and Insights restore the tab's refresh token before opening
protected routes. Access tokens remain in memory. Only the rotated refresh token
and the last user-input timestamp are persisted in `sessionStorage`, under
separate app keys. Storage-disabled browsers can still sign in for the current
page lifetime.

Reloading and token rotation do not reset the ten-minute BR-03 inactivity
deadline. Expired or rejected sessions clear persistence and open login with an
allowlisted return URL. Startup requests have a ten-second timeout; concurrent
refreshes share one exchange, and late responses cannot resurrect a logged-out
session or replace a newer login. API 401s invalidate the token actually sent;
requests, including order submissions, are not automatically replayed.

## Routes and restored state

- NextTrade: `/dashboard`, `/orders`, `/history`, `/settings`, `/watchlist`,
  `/portfolio`, and tier-specific `/learn`, `/markets`, `/screeners`.
- Insights: `/dashboard`, `/orders`, `/history`, `/settings`, `/client-activity`,
  `/clients`, `/reports`, `/compliance`, `/clients/:id`, and `/orders/:id`.
- URL parameters retain search, dates, filters, chart/grouping choices, panels,
  selected stocks, detail tabs, and Insights preview/display preferences.
- Back/Forward hydrates the same URL state. Invalid parameters fall back to
  existing defaults; unavailable records display a notice.
- Restoring a different stock initializes its ticket prices. Subsequent chart
  changes preserve edited prices. Order drafts and report export history reset
  on reload; API data is fetched again.

NextTrade requires TRADER; Insights now offers ANALYST sign-in. The Insights
Analyst/Operations selector remains a sample-data preview and does not change
the authenticated role. Both apps build independently; their pure auth/session
implementations and contract tests are mirrored.

## Recent pull-request compatibility

Checked on 2026-10-13. Delivery includes main at
`8e2bc7e370a02f88b4fbdabf01e4e1cfd121eb10` through local merge
`ba849d3bfb41470cf1295859925ae7125331bb38`, preserving NEXT-215.
PRs #118, #120, #124, #125 and #136 merged into main during the work and are
included. The remaining open PRs were integrated separately on the unpublished
branch `validation/NEXT-220-pending-prs`, final commit
`f4febc8389ea41c28cfb51515f4da4d4db46394a`.

| Open PR | Tested head |
| --- | --- |
| [#121 - Order detail/status](https://github.com/juliawiecek/lil-leap/pull/121) | `41024f91f05410b78cbc076cc2ec4b43af58560c` |
| [#123 - Frontend UI updates](https://github.com/juliawiecek/lil-leap/pull/123) | `24802e235ad7bff371efa9ca10d304af486a9757` |

Integration resolutions preserve quote-preview and order-detail routing,
ownership/role checks, settlement recovery and cash adapters, live quote/history
polling, and the UI PR's login markup/styles. Integration-only legacy animation
assertions now check the actual brand phase instead of expecting a retained,
hidden DOM node to be absent. Open PR code remains on the validation branch.

## Validation

Windows, Node 24.19.0, Maven 3.9.9, installed Edge in headless Playwright.

| Check | Delivery | With pending PRs |
| --- | --- | --- |
| Full trading unit suite | 177 passed | 178 passed |
| Full Insights unit suite | 49 passed | 49 passed |
| Production builds, both apps | Passed | Passed |
| Final browser suite, both apps | 30 passed; 4 inapplicable project cases skipped | 30 passed; same 4 skipped |
| Orders Maven suite after main/PR updates | 253 passed; 24 PostgreSQL cases skipped | 263 passed; 26 PostgreSQL cases skipped |

After the final stock-price hydration change, the trading dashboard/ticket unit
checks also passed (28 tests), and both builds/browser suites were rerun for the
changed trading app. Both mirrored core files have matching hashes. Diff checks
and conflict-marker checks passed. The pending UI PR retains its existing
`app.scss` warning: 26.26 kB against a 20 kB warning budget.

Browser checks cover direct links and refresh on the four principal pages,
delayed/rejected restoration, rotating tokens, the remaining idle window,
logout plus Back, a fresh tab, role rejection, URL filters and navigation,
selected stock/chart/ticket prices, Novice-only rendering, Insights client/trade
details, and API 401 sign-out. Identity and trading APIs are mocked; these tests
do not exercise live backend authentication or a live PostgreSQL database.

Both existing nginx configurations already use
`try_files $uri $uri/ /index.html`. Static regression checks verify the fallback
and separate API/auth handling. Automatic approval review rejected launching the
downloaded nginx executable with "blocked by policy" and supplied no further
reason. Browser checks therefore used the committed local static server with
SPA fallback; an actual nginx runtime check remains unverified.

To reproduce browser checks, build both apps and run `npm run test:e2e` from
`frontend`. See the app READMEs for session, route and test-server details.
No task implementation commit was created on the delivery branch, and nothing
was pushed, deployed, or changed in Jira.
