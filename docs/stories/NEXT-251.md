# NEXT-251 — Market-only advanced order ticket (PS-31)

The checkout already removed the unsupported order settings and fee calculation
as part of the advanced dashboard cleanup. This story verifies that behavior
through the rendered ticket, review dialog, and serialized order request, and
makes the remaining execution terms explicit in the review.

| Acceptance criterion | Implementation and regression coverage |
| --- | --- |
| Market only until NEXT-232 | `advanced-ticket.html` offers symbol, quantity, and Buy/Sell; no order-type selector, limit price, Time in Force, Take Profit, or Stop Loss. Buy and sell tests inspect the rendered controls and require `orderType: 'MARKET'` in the request body. |
| No displayed or calculated fee | The ticket and review show live price and estimated total only. `AdvancedDashboard.total()` is quantity times live price; validation compares that cost with buying power. The cash-boundary regression accepts exactly $200 for two $100 shares and rejects $199.99 at both review and confirmation. |
| Review matches submission | The dialog shows the selected account, symbol, side, Market type, quantity, and price-protection percentage. Buy/sell regressions exercise the real template events and `OrderSubmissionClient` serialization and compare the complete outgoing body, including the review's client reference. |
| Market estimates are understood | Both screens explain that the final price and total can differ from the estimate. A live-price regression verifies that the open review updates and confirmation rejects an order that has become unaffordable. |

Price protection remains because it is supported by the orders API through
`bufferPercent` (PS-12); it does not add a fee or a buying-power surcharge.

Verification completed on 2026-10-19, from `frontend/`:

```powershell
node --test tests/advanced-ticket.test.mjs
node --test --test-concurrency=1 tests/*.test.mjs
$env:NG_BUILD_MAX_WORKERS = '1'
npm run build
```

All four focused regressions and all 249 frontend tests passed, with no skipped
tests. The production build passed with the existing `app.scss` size warning
(26.26 kB against a 20 kB warning budget). The initial concurrent test/build run
exhausted local memory; the complete suite and build passed sequentially with
the worker settings above. No repository configuration was changed for this.

The new tests render Angular templates in Happy DOM and inspect the serialized
POST body using a controlled HTTP transport. They do not claim real-service
execution or settlement coverage.
