import './component-helper.mjs';
import { signal } from '@angular/core';
const { MarketFeed } = await import('../src/app/market-feed.service.ts');

/**
 * A stand-in for the shared live-price feed: fixed quotes and market status the test controls.
 * `push(rows)` replaces the prices and notifies the dashboards, like a real refresh.
 */
export function fakeFeed(rows, status = null) {
  const toQuote = (row) => ({
    instrumentId: `${row.symbol.toLowerCase()}-uuid`, name: row.symbol, sector: 'TECH', change: 0,
    bid: row.price, ask: row.price, quotedAt: new Date().toISOString(), direction: null, version: 0, ...row,
  });
  const listeners = new Set();
  return {
    quotes: signal(rows.map(toQuote)),
    status: signal(status),
    now: signal(Date.now()),
    starts: 0,
    stops: 0,
    start() {
      this.starts += 1;
      return () => { this.stops += 1; };
    },
    onUpdate(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    quote(symbol) {
      return this.quotes().find((q) => q.symbol === symbol);
    },
    push(next) {
      this.quotes.set(next.map(toQuote));
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

export const feedProvider = (feed) => ({ provide: MarketFeed, useValue: feed });
