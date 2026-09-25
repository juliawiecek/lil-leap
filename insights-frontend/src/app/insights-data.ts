export interface Client {
  id: string;
  name: string;
  region: string;
  joined: string;
  value: number;
  cash: number;
  segment: string;
}
export interface Trade {
  id: string;
  clientId: string;
  symbol: string;
  asset: string;
  market: string;
  side: string;
  quantity: number;
  price: number;
  status: string;
  submitted: string;
}
export const instruments = [
  { symbol: 'AAPL', name: 'Apple Inc.', asset: 'Equities', market: 'US', price: 178.24 },
  { symbol: 'MSFT', name: 'Microsoft', asset: 'Equities', market: 'US', price: 415.32 },
  { symbol: 'NVDA', name: 'NVIDIA', asset: 'Equities', market: 'US', price: 124.58 },
  { symbol: 'TSLA', name: 'Tesla', asset: 'Equities', market: 'US', price: 245.6 },
  { symbol: 'EUR/USD', name: 'Euro / US dollar', asset: 'FX', market: 'Global', price: 1.08 },
  {
    symbol: 'BTC/USD',
    name: 'Bitcoin / US dollar',
    asset: 'Crypto',
    market: 'Global',
    price: 61230,
  },
];
const names = [
  'Alex Carter',
  'Maria Lopez',
  'James Park',
  'Priya Desai',
  'Wei Zhang',
  'Thomas Reid',
  'Sarah Kim',
  'Daniel Cho',
  'Emily Watson',
  'Robert Chen',
  'Olivia Grant',
  'Michael Tan',
  'Morgan Lee',
  'Jordan Kim',
  'Taylor Brooks',
  'Casey Nguyen',
];
export const clients: Client[] = names.map((name, i) => {
  const value = [86421.23, 7250, 186300, 43000, 6900, 245000, 52000, 18000][i % 8];
  return {
    id: `C-${104982 + i}`,
    name,
    region: i % 3 ? 'US' : 'UK',
    joined: i % 4 === 0 ? `2026-09-${String(i + 1).padStart(2, '0')}` : '2025-03-12',
    value,
    cash: Math.round(value * 0.145 * 100) / 100,
    segment: value < 10000 ? 'Under $10K' : value <= 100000 ? '$10K–$100K' : 'Over $100K',
  };
});
export const trades: Trade[] = Array.from({ length: 240 }, (_, i) => {
  const item = instruments[i % 6];
  return {
    id: `ORD-${10078400 + i}`,
    clientId: clients[i % 12].id,
    symbol: item.symbol,
    asset: item.asset,
    market: item.market,
    side: i % 3 ? 'Buy' : 'Sell',
    quantity:
      item.asset === 'Crypto'
        ? 0.05 * ((i % 5) + 1)
        : item.asset === 'FX'
          ? 1000 * ((i % 7) + 1)
          : ((i % 9) + 1) * 10,
    price: item.price,
    status:
      i % 17 === 0 ? 'Rejected' : i % 19 === 0 ? 'Accepted' : i % 23 === 0 ? 'Submitted' : 'Filled',
    submitted: `2026-${i < 120 ? '08' : '09'}-${String((i % 22) + 1).padStart(2, '0')}T${String(9 + (i % 7)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:22Z`,
  };
})
  .filter((t) => t.submitted.slice(0, 10) >= clients.find((c) => c.id === t.clientId)!.joined)
  .sort((a, b) => b.submitted.localeCompare(a.submitted));
export interface Filters {
  start: string;
  end: string;
  asset: string;
  market: string;
  segment: string;
}
export function filterTrades(rows: Trade[], f: Filters) {
  return rows.filter(
    (t) =>
      t.submitted.slice(0, 10) >= f.start &&
      t.submitted.slice(0, 10) <= f.end &&
      (f.asset === 'All' || t.asset === f.asset) &&
      (f.market === 'All' || t.market === f.market) &&
      (f.segment === 'All' || clients.find((c) => c.id === t.clientId)?.segment === f.segment),
  );
}
export function summarize(rows: Trade[]) {
  const fills = rows.filter((t) => t.status === 'Filled');
  const volume = fills.reduce((s, t) => s + t.quantity * t.price, 0);
  return {
    volume,
    orders: rows.length,
    fills: fills.length,
    active: new Set(fills.map((t) => t.clientId)).size,
    average: fills.length ? volume / fills.length : 0,
  };
}
export function activityFor(id: string, start: string, end: string) {
  const fills = trades.filter(
    (t) => t.clientId === id && t.status === 'Filled' && t.submitted.slice(0, 10) <= end,
  );
  return fills.some((t) => t.submitted.slice(0, 10) >= start)
    ? 'Active'
    : fills.length
      ? 'Occasional'
      : 'Dormant';
}
export function buckets(rows: Trade[], cadence: string) {
  const result = new Map<string, number>();
  for (const t of rows.filter((t) => t.status === 'Filled')) {
    let key = t.submitted.slice(0, 10);
    if (cadence === 'Weekly') {
      const d = new Date(key + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      key = d.toISOString().slice(0, 10);
    }
    if (cadence === 'Monthly') key = key.slice(0, 7);
    if (cadence === 'Yearly') key = key.slice(0, 4);
    result.set(key, (result.get(key) || 0) + t.quantity * t.price);
  }
  return [...result]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }));
}
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
