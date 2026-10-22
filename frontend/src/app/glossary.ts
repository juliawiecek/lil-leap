import type { SpeechService } from './speech';

/**
 * Plain-English explanations of trading words (PS-23), shared by "What's this?" (Alt+W) and the
 * glossary in the novice Learn hub. An element opts in with `data-glossary="buying-power"`; Alt+W
 * reads the entry for whatever the switch-control ring is on, the focused control, or the item
 * under the mouse, and shows it as a caption.
 */
export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const GLOSSARY = {
  'limit-price': {
    term: 'Limit price',
    definition:
      'The most you will pay when buying, or the least you will accept when selling. The order only fills at that price or better, so it might not fill at all.',
  },
  'market-order': {
    term: 'Market order',
    definition:
      'Buys or sells straight away at the best price available now. The final price can be a little different from the price you see.',
  },
  'time-in-force': {
    term: 'Time in force',
    definition:
      'How long an order stays open if it does not fill. Day ends it when the market closes today. Good till cancelled keeps it open until it fills or you cancel it.',
  },
  'take-profit': {
    term: 'Take profit',
    definition: 'A price at which your shares are sold automatically to lock in a gain.',
  },
  'stop-loss': {
    term: 'Stop loss',
    definition:
      'A price at which your shares are sold automatically to limit a loss if the price keeps falling. In a fast market it can sell below that price.',
  },
  'price-protection': {
    term: 'Price protection',
    definition:
      'The most the price may move against you between placing an order and it filling. If it moves further, the order is cancelled instead of filling at a surprise price.',
  },
  'buying-power': {
    term: 'Buying power',
    definition: 'The cash in your account that you can use to buy stocks right now.',
  },
  'bid-ask': {
    term: 'Bid and ask',
    definition:
      'The bid is the highest price a buyer is offering right now. The ask is the lowest price a seller will accept. You usually buy near the ask and sell near the bid.',
  },
  'order-book': {
    term: 'Order book',
    definition: 'The list of buy and sell orders waiting at each price, showing how many shares people want to trade and where.',
  },
  volume: {
    term: 'Volume',
    definition: 'How many shares changed hands in a period. Higher volume means more people are trading.',
  },
  rsi: {
    term: 'RSI, relative strength index',
    definition:
      'A score from 0 to 100 showing how strongly the price has been moving. Above 70 is often called overbought, and below 30 oversold.',
  },
  ema: {
    term: 'EMA, exponential moving average',
    definition:
      'The average price over recent periods, with the newest prices counting most. EMA 50 follows the short-term trend and EMA 200 the long-term trend.',
  },
  vwap: {
    term: 'VWAP, volume-weighted average price',
    definition: "The day's average price, giving more weight to prices where more shares traded.",
  },
  'total-return': {
    term: 'Total return',
    definition: 'How much your investments have gained or lost overall compared with what you paid, in dollars and as a percent.',
  },
  'average-cost': {
    term: 'Average cost',
    definition: 'The average price you paid for each share you own, across all your buys.',
  },
  share: { term: 'Share', definition: 'A unit of ownership in a company.' },
  dividend: { term: 'Dividend', definition: 'A payment a company may make to its shareholders.' },
  'time-horizon': { term: 'Time horizon', definition: 'The time until you expect to need invested money.' },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

/** The words the novice Learn hub explains, from the same glossary. */
export const LEARN_GLOSSARY: readonly GlossaryEntry[] = (
  ['share', 'dividend', 'time-horizon', 'market-order', 'limit-price', 'buying-power', 'average-cost', 'total-return'] as const
).map((key) => GLOSSARY[key]);

export const NO_GLOSSARY = 'No extra help for this item.';

/** The entry for a data-glossary value, or null when there is none. */
export function glossaryEntry(key: string | null | undefined): GlossaryEntry | null {
  return key && Object.hasOwn(GLOSSARY, key) ? GLOSSARY[key as GlossaryKey] : null;
}

/** The entry for an element: its own data-glossary, or the nearest one around it. */
export function glossaryFor(el: Element | null | undefined): GlossaryEntry | null {
  return glossaryEntry(el?.closest<HTMLElement>('[data-glossary]')?.dataset['glossary']);
}

/** What "What's this?" says: "Buying power. The cash in your account ...", or that there is no help. */
export function glossaryHelp(el: Element | null | undefined): string {
  const entry = glossaryFor(el);
  return entry ? `${entry.term}. ${entry.definition}` : NO_GLOSSARY;
}

/**
 * Alt+W ("What"). Free in Chrome, Edge, Firefox and Safari; the app already uses Alt+B and Alt+S.
 * Checks the physical key too, since Option+W types a symbol on a Mac.
 */
export function isGlossaryShortcut(event: KeyboardEvent): boolean {
  return event.altKey && !event.ctrlKey && !event.metaKey && (event.code === 'KeyW' || event.key?.toLowerCase() === 'w');
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
  return candidates.find((el) => glossaryFor(el)) ?? (focused?.isConnected ? focused : null) ?? candidates[0] ?? null;
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
 * Listens for Alt+W on every page and says (and captions) what the item is. Urgent, since the user
 * asked. Returns a function that stops listening.
 */
export function listenForGlossary(doc: Document, speech: SpeechService, ringed: () => Element | null = () => null): () => void {
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
    speech.speak(glossaryHelp(glossaryTarget(doc, ringed(), hovered)), { priority: 'urgent', source: 'glossary' });
  };
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('mouseover', onOver, true);
  return () => {
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('mouseover', onOver, true);
  };
}
