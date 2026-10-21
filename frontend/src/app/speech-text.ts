/**
 * Text as it should sound. Screens show ticker symbols, arrows and bullets; read aloud they come
 * out as "A M Z N", "up right arrow" or "dot dot". Everything switch control says goes through
 * speakable() first.
 */

/** Each listed stock as people say it (the 33 tradable instruments in the catalog). */
export const STOCK_NAMES: Readonly<Record<string, string>> = {
  AAPL: 'Apple',
  ADBE: 'Adobe',
  AMD: 'A M D',
  AMZN: 'Amazon',
  AVGO: 'Broadcom',
  BA: 'Boeing',
  BAC: 'Bank of America',
  CAT: 'Caterpillar',
  COST: 'Costco',
  CVX: 'Chevron',
  DIS: 'Disney',
  GOOGL: 'Google',
  GS: 'Goldman Sachs',
  HD: 'Home Depot',
  INTC: 'Intel',
  JNJ: 'Johnson and Johnson',
  JPM: 'J P Morgan',
  KO: 'Coca-Cola',
  LLY: 'Eli Lilly',
  META: 'Meta',
  MSFT: 'Microsoft',
  NEE: 'NextEra Energy',
  NFLX: 'Netflix',
  NVDA: 'Nvidia',
  PEP: 'Pepsi',
  PFE: 'Pfizer',
  PG: 'Procter and Gamble',
  PLD: 'Prologis',
  TSLA: 'Tesla',
  UNH: 'UnitedHealth',
  V: 'Visa',
  WMT: 'Walmart',
  XOM: 'Exxon Mobil',
};

/** A stock's spoken name, or null for a symbol not in the catalog. */
export function stockName(symbol: string): string | null {
  return STOCK_NAMES[symbol.toUpperCase()] ?? null;
}

/** Marks that mean nothing aloud: arrows, stars, check marks, the keypad's delete key. */
const SILENT = new Set('↗↘↖↙→←↑↓▲▼◀▶⏸★☆✓✔✕×⌫…');
/** Separators shown between parts ("AAPL · Apple Inc."); said as a pause. */
const SEPARATORS = new Set('·|');
const BULLETS = new Set('•●');

/**
 * Symbols, arrows and bullets replaced or dropped, words glued together on screen pulled apart,
 * and ticker symbols said as company names: "Sign out ↗" becomes "Sign out",
 * "account ••B3B9$24,550.68 available" becomes "account, ending in B3B9, $24,550.68 available",
 * and "Buy 2 AMZN" becomes "Buy 2 Amazon".
 */
export function speakable(text: string): string {
  let out = '';
  let bullets = false;
  for (const ch of text) {
    if (BULLETS.has(ch)) {
      bullets = true;
      continue;
    }
    if (bullets) {
      // "••B3B9" is the end of an account number.
      out += ', ending in ';
      bullets = false;
    }
    if (ch === '$' && /[A-Za-z0-9]$/.test(out)) {
      // "B3B9$24,550.68": two things shown side by side, said with a pause between.
      out += ', ';
    }
    if (SEPARATORS.has(ch)) {
      out += ', ';
    } else if (SILENT.has(ch)) {
      out += ' ';
    } else {
      out += ch;
    }
  }
  const named = out.split(/(\b[A-Z]{1,5}\b)/).map((part) => STOCK_NAMES[part] ?? part).join('');
  return tidy(named);
}

/**
 * One space between words, no space before a comma, no doubled or dangling commas. Commas inside
 * numbers ("$24,550.68") are kept, since they are followed by a digit.
 */
function tidy(text: string): string {
  return text
    .split(/,(?!\d)/)
    .map((part) => part.split(/\s/).filter(Boolean).join(' '))
    .filter(Boolean)
    .join(', ');
}
