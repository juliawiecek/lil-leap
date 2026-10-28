import { sayNow } from './captions';

/**
 * "What's this?" (PS-23): plain-English explanations of trading words. An element opts in with
 * `data-glossary="buying-power"` (or sits inside one that does); Alt+W reads the entry for whatever
 * the switch-control ring is on, the focused control, or the item under the mouse, and captions it.
 *
 * Voice mode's Detailed level (PS-22) adds the same explanation after an item's name: call
 * `glossaryHint(element)`, which is '' when the item has no entry.
 */
export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const GLOSSARY = {
  'limit-price': {
    term: 'Limit price',
    definition:
      'The most you will pay when buying, or the least you will take when selling. The order only goes through at that price or better, so it might not go through at all.',
  },
  'market-order': {
    term: 'Market order',
    definition:
      'Buys or sells straight away at the best price available now. The final price can be a little different from the price you see.',
  },
  'time-in-force': {
    term: 'Time in force',
    definition:
      'How long an order stays open if it does not go through. Day ends it when the market closes today. Good till cancelled, or GTC, keeps it open until it goes through or you cancel it.',
  },
  'take-profit': {
    term: 'Take profit',
    definition: 'A price at which your shares are sold for you, to keep a gain.',
  },
  'stop-loss': {
    term: 'Stop loss',
    definition:
      'A price at which your shares are sold for you, to limit a loss if the price keeps falling. When prices move fast, it can sell for less than that price.',
  },
  'price-protection': {
    term: 'Price protection',
    definition:
      'The most the price may move against you between placing an order and it going through. If it moves more, the order is cancelled and nothing is charged.',
  },
  'buying-power': {
    term: 'Buying power',
    definition: 'The cash in your account that you can use to buy stocks right now.',
  },
  'bid-ask': {
    term: 'Bid and ask',
    definition:
      'The bid is the highest price a buyer is offering right now. The ask is the lowest price a seller will take. You usually buy near the ask and sell near the bid.',
  },
  'order-book': {
    term: 'Order book',
    definition: 'The list of orders waiting to buy and sell at each price, and how many shares each one wants.',
  },
  volume: {
    term: 'Volume',
    definition: 'How many shares were bought and sold in a period. More volume means more people are trading.',
  },
  rsi: {
    term: 'RSI, relative strength index',
    definition:
      'A score from 0 to 100 that shows how strongly the price has been moving. Above 70 is often called overbought, and below 30 oversold.',
  },
  ema: {
    term: 'EMA, exponential moving average',
    definition:
      'The average price over recent periods, with the newest prices counting most. EMA 50 follows the short-term trend and EMA 200 the long-term trend.',
  },
  vwap: {
    term: 'VWAP, volume-weighted average price',
    definition: "The day's average price, where prices at which more shares were traded count more.",
  },
  'total-return': {
    term: 'Total return',
    definition: 'How much your investments have gained or lost in total compared with what you paid, in dollars and as a percent.',
  },
  'average-cost': {
    term: 'Average cost',
    definition: 'The average price you paid for each share you own, across all your buys.',
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

export const NO_GLOSSARY = 'No extra help for this item.';

/** The entry for a data-glossary value, or null when there is none. */
export function glossaryEntry(key: string | null | undefined): GlossaryEntry | null {
  return key && Object.hasOwn(GLOSSARY, key) ? GLOSSARY[key as GlossaryKey] : null;
}

/** The entry for an element: its own data-glossary, or the nearest one around it. */
export function glossaryFor(el: Element | null | undefined): GlossaryEntry | null {
  const tagged = typeof el?.closest === 'function' ? el.closest('[data-glossary]') : null;
  return glossaryEntry(tagged?.getAttribute('data-glossary'));
}

/** What "What's this?" says: "Buying power. The cash in your account ...", or that there is no help. */
export function glossaryHelp(el: Element | null | undefined): string {
  const entry = glossaryFor(el);
  return entry ? `${entry.term}. ${entry.definition}` : NO_GLOSSARY;
}

/**
 * The explanation alone, for voice mode's Detailed level (PS-22) to say after an item's name;
 * '' when the item has none, so nothing extra is said.
 */
export function glossaryHint(el: Element | null | undefined): string {
  return glossaryFor(el)?.definition ?? '';
}

/**
 * Alt+W ("What"). Not taken by Chrome, Edge, Firefox or Safari, nor by the app's other shortcuts.
 * Checks the physical key too, since Option+W types a symbol on a Mac.
 */
export function isGlossaryShortcut(event: KeyboardEvent): boolean {
  const otherModifier = event.ctrlKey || event.metaKey || event.shiftKey;
  return event.altKey && !otherModifier && (event.code === 'KeyW' || event.key?.toLowerCase() === 'w');
}

/**
 * Which element Alt+W explains: whatever the switch-control ring is on, since that is what the
 * user is looking at; otherwise the focused control or the item under the mouse, preferring
 * whichever has an explanation.
 */
export function glossaryTarget(doc: Document, ringed: Element | null, hovered: Element | null): Element | null {
  if (ringed?.isConnected) {
    return ringed;
  }
  const focused = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
  // Keyboard focus is where the user is; focus left on a button clicked earlier gives way to the mouse.
  const order = focused && keyboardFocused(focused) ? [focused, hovered] : [hovered, focused];
  const candidates = order.filter((el): el is Element => !!el?.isConnected);
  return candidates.find((el) => glossaryFor(el)) ?? candidates[0] ?? null;
}

function keyboardFocused(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    // Browsers without :focus-visible treat all focus as keyboard focus.
    return true;
  }
}

/**
 * Listens for Alt+W on every page and says (and captions) what the item is, cutting in, since the
 * user asked. Returns a function that stops listening.
 */
export function listenForGlossary(
  doc: Document,
  ringed: () => Element | null = () => null,
  say: (text: string) => void = (text) => sayNow('glossary', text),
): () => void {
  let hovered: Element | null = null;
  const onOver = (event: Event) => {
    const target = event.target as Element | null;
    hovered = typeof target?.closest === 'function' ? target : null;
  };
  const onKey = (event: KeyboardEvent) => {
    if (!isGlossaryShortcut(event)) {
      return;
    }
    event.preventDefault();
    if (event.repeat) {
      return;
    }
    say(glossaryHelp(glossaryTarget(doc, ringed(), hovered)));
  };
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('mouseover', onOver, true);
  return () => {
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('mouseover', onOver, true);
  };
}
