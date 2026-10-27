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
      // "••B3B9" is the end of an account number; "•••••• invested" is a hidden balance.
      out += /[A-Za-z0-9]/.test(ch) ? ', ending in ' : ' hidden';
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
  if (bullets) {
    // A balance hidden at the end: "Total portfolio value ••••••••".
    out += ' hidden';
  }
  const named = out.split(/(\b[A-Z]{1,5}\b)/).map((part) => STOCK_NAMES[part] ?? part).join('');
  return tidy(named);
}

const NUMBER = String.raw`(\d[\d,]*(?:\.\d+)?)`;
/** A sign that starts a value ("+1.2%", "−$4.10"), not a hyphen inside a word or range. */
const SIGN = String.raw`(?<![\w.])([+−-])\s?`;
const direction = (sign: string) => (sign === '+' ? 'up' : 'down');

/** "$185" as "185 dollars", "$24,550.68" as "24,550 dollars and 68 cents". */
function dollars(amount: string): string {
  const [whole, cents = ''] = amount.split('.');
  const pennies = Number(cents.padEnd(2, '0').slice(0, 2));
  return pennies ? `${whole} dollars and ${pennies} cents` : `${whole} dollars`;
}

/**
 * Text for voice mode (PS-22): speakable() first, then the symbols a speech engine might read out
 * literally said as words. "+1.20%" becomes "up 1.20 percent", "−$4.10" "down 4 dollars and 10
 * cents", "$185" "185 dollars", and a "+" or "$" standing on its own is dropped.
 */
export function voiceText(text: string): string {
  const words = speakable(text)
    .replace(new RegExp(`${SIGN}${NUMBER}\\s?%`, 'g'), (_, sign: string, n: string) => `${direction(sign)} ${n} percent`)
    .replace(new RegExp(`${SIGN}\\$${NUMBER}`, 'g'), (_, sign: string, n: string) => `${direction(sign)} ${dollars(n)}`)
    .replace(new RegExp(`\\$${NUMBER}`, 'g'), (_, n: string) => dollars(n))
    .replace(new RegExp(`${NUMBER}\\s?%`, 'g'), '$1 percent')
    .replace(new RegExp(`(?<![\\w.])\\+(?=\\d)`, 'g'), 'plus ')
    .replace(/[+$%]/g, ' ');
  return tidy(words);
}

/**
 * How voice mode says a stock in the ticker, holdings or watchlist: its name, the price rounded
 * to whole dollars and the day's change in words, then what selecting it does.
 * "Apple, 185 dollars, up 1.2 percent. Select to trade."
 */
export function spokenQuote(company: string, price: number, changePercent: number, delayed = false): string {
  if (!price) {
    return `${company}, price not available yet.`;
  }
  const rounded = price >= 10 ? Math.round(price).toLocaleString('en-US') : String(Number(price.toFixed(2)));
  const size = Math.abs(changePercent);
  const change = size < 0.05 ? 'unchanged' : `${changePercent > 0 ? 'up' : 'down'} ${size.toFixed(1)} percent`;
  return `${company}, ${rounded} dollars, ${change}${delayed ? ', price delayed' : ''}. Select to trade.`;
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
