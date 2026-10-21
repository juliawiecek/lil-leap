# Advanced orders

The advanced ticket supports MARKET and LIMIT entries, independent take-profit and stop-loss price levels, price/percentage entry, position sizing presets, and estimated reward/risk. Percentage distances resolve to explicit prices before submission.

The ticket displays bid, ask, and spread (USD and percentage of midpoint). Market estimates use ask for buys and bid for sells. Risk-based sizing divides the USD budget by the entry-to-stop distance, rounds down to whole shares, and caps quantity by available cash (including market price protection) or shares held. It requires a fresh valid quote and an enabled stop on the correct side. Applying the suggestion changes quantity once; subsequent price changes do not silently resize the order. Gaps and slippage may exceed the estimated risk.

Up to ten named order presets are saved per account in browser local storage. They include order type, quantity, protection percentage, optional risk budget and optional exit percentage distances. Applying a preset preserves the current symbol and side and resets a limit price to the current side's quote. Presets do not submit orders or automatically apply risk sizing. Saving an existing name replaces it; Remove deletes it. They do not sync between devices and storage failures are reported in the ticket.

Apply `db/migrations/016_advanced_orders.sql` to existing databases before restarting Orders and Holdings. Fresh databases use the updated `db/finalized-schema.sql`.

Limit buys wait for ask <= limit; limit sells wait for bid >= limit. They stay open until filled, cancelled, or rejected by execution eligibility/resource checks. Waiting for a price does not consume failure retries. Market hours, fresh quotes, ownership checks, available cash/shares, and transactional settlement still apply.

After an entry fills, the same transaction creates at most one linked, opposite-side conditional order for the full filled quantity. Either threshold can activate it; there are no competing sibling orders that could double-close. Buy entries exit by selling; sell entries buy back shares (short selling remains unsupported). Take-profit executes at its target or better; stop-loss executes at the current available price, which can be worse than the trigger. Thresholds are fixed prices and do not trail. Orders are monitored by the server, not by the browser.

Activity shows the automatic-exit label and thresholds. Cancel a pending entry to prevent creation of its exit; once filled, cancel the separate automatic-exit order in Activity. Cash/shares are not reserved for these orders and are checked again at execution. Both entries and exits may be rejected if resources or account/instrument eligibility change. One fill and one exit creation are protected by database transactions and a unique parent link.

Validation: advanced frontend and transport tests; backend request validation and price-boundary tests; PostgreSQL lifecycle tests cover prolonged waiting, stale claims, single-exit creation, gap stops, sell-entry buybacks, cancellation, settlement and idempotent retries.
