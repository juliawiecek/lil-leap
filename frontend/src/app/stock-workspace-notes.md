# Stock workspace

The registration trader level selects the novice or advanced welcome experience. Sign-in opens a returning-user novice workspace because authentication and stored account preferences are not connected. The workspace selector allows either layout to be explored.

## Design decisions

- Keep the selected stock connected to its chart and order ticket so users do not repeatedly enter the same symbol.
- Novice: concise explanations, a three-step welcome, straightforward market-order practice, and short learning guides.
- Advanced: compact quote details, illustrative volume bars, and market/limit-order practice in the same workspace.
- Shared: searchable sample stocks, editable watchlist, portfolio, order history, review-before-confirmation, and responsive navigation.
- Use NextTrade's dark olive palette and Space Grotesk headings, with a quiet interface and no flashing quote updates.

Research consulted:
- Fidelity Trader+ Web: https://www.fidelity.com/learning-center/trading-investing/trading-platforms/how-to-use-trader-plus-web/ — linked selection across watchlists, charts, and quote tools.
- Schwab thinkorswim web: https://www.schwab.com/trading/thinkorswim/web — essential tools within one workspace.
- Robinhood watchlists: https://robinhood.com/us/en/support/articles/lists/ — saving symbols and opening stock details.
- Robinhood advanced charts: https://robinhood.com/us/en/support/articles/using-advanced-charts/ — additional chart detail for experienced users.

## Preview boundaries

No authentication, account opening, market-data feed, persistence, or brokerage execution is implemented. Prices, histories, bid/ask spreads, and volume are illustrative. A visible practice banner identifies this. Each session starts with $10,000 in simulated cash and no positions. No registration data is sent or persisted. Limit orders that do not meet the fixed sample quote are not queued. Refresh or sign-out clears the dashboard state.

## Validation

`npm run build` validates Angular templates and the production bundle.
