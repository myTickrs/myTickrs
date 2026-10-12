import { MARKET_CATALOG, optionIndex, type MarketDef } from '@tickrs/shared';
import { marketClock, type MarketClock } from './calendar.js';
import { CA_HOLIDAYS, HOLIDAY_SNAPSHOT_THROUGH, US_HOLIDAYS } from './holiday-snapshot.js';
import type { Listing, SearchHit } from './plugin/contract.js';

export type { MarketDef };

export interface SymbolParts {
  ticker: string;
  suffix: string | null;
}

export const US_MARKET: MarketDef = {
  code: 'US',
  name: 'United States',
  country: 'US',
  timezone: 'America/New_York',
  sessions: [{ open: '09:30', close: '16:00' }],
  weekdays: [1, 2, 3, 4, 5],
  closedDays: [...US_HOLIDAYS],
  holidaysThrough: HOLIDAY_SNAPSHOT_THROUGH,
  currency: 'USD',
  suffixes: [],
  testSymbol: 'SPY',
};

export const CA_MARKET: MarketDef = {
  code: 'CA',
  name: 'Canada',
  country: 'CA',
  timezone: 'America/Toronto',
  sessions: [{ open: '09:30', close: '16:00' }],
  weekdays: [1, 2, 3, 4, 5],
  closedDays: [...CA_HOLIDAYS],
  holidaysThrough: HOLIDAY_SNAPSHOT_THROUGH,
  currency: 'CAD',
  suffixes: [
    { suffix: 'TO', exchange: 'TSX', mic: 'XTSE' },
    { suffix: 'V', exchange: 'TSXV', mic: 'XTSX' },
    { suffix: 'NE', exchange: 'NEO', mic: 'NEOE' },
  ],
  testSymbol: 'RY.TO',
};

export const DEFAULT_MARKETS: readonly MarketDef[] = [US_MARKET, CA_MARKET];

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
const SHORT_NAMES: Record<string, string> = { HK: 'Hong Kong' };

export const BUILT_IN_MARKETS: readonly MarketDef[] = MARKET_CATALOG.map(
  (c) =>
    DEFAULT_MARKETS.find((m) => m.country === c.country) ?? {
      code: c.country,
      name: SHORT_NAMES[c.country] ?? countryNames.of(c.country) ?? c.country,
      country: c.country,
      timezone: c.timezone,
      sessions: c.sessions.map((s) => ({ ...s })),
      weekdays: [...c.weekdays],
      closedDays: [],
      holidaysThrough: null,
      currency: c.currency,
      suffixes: c.suffixes.map((s) => ({ ...s })),
      testSymbol: c.testSymbol,
    },
);

const US_VENUES = new Set([
  'XNAS',
  'XNYS',
  'ARCX',
  'XASE',
  'BATS',
  'XCBO',
  'IEXG',
  'OOTC',
  'XOTC',
  'PINX',
  'NASDAQ',
  'NYSE',
  'NYSE ARCA',
  'NYSEARCA',
  'AMEX',
  'NYSE AMERICAN',
  'CBOE',
  'OTC',
  'US',
]);

export class MarketRegistry {
  private readonly bySuffix = new Map<string, { market: MarketDef; exchange: string; mic: string | null }>();
  private readonly byCode = new Map<string, MarketDef>();
  readonly home: MarketDef | undefined;

  constructor(readonly markets: readonly MarketDef[]) {
    for (const market of markets) {
      this.byCode.set(market.code, market);
      for (const s of market.suffixes) {
        if (!this.bySuffix.has(s.suffix)) {
          this.bySuffix.set(s.suffix, { market, exchange: s.exchange, mic: s.mic });
        }
      }
    }
    this.home = markets.find((m) => m.suffixes.length === 0) ?? markets[0];
  }

  get codes(): string[] {
    return this.markets.map((m) => m.code);
  }

  get(code: string): MarketDef | undefined {
    return this.byCode.get(code);
  }

  split(symbol: string): SymbolParts {
    const upper = symbol.toUpperCase();
    const dot = upper.lastIndexOf('.');
    const suffix = dot > 0 ? upper.slice(dot + 1) : '';
    return suffix && this.bySuffix.has(suffix)
      ? { ticker: upper.slice(0, dot), suffix }
      : { ticker: upper, suffix: null };
  }

  marketOf(symbol: string): MarketDef | undefined {
    const index = optionIndex(symbol);
    if (index) return this.markets.find((m) => m.country === index.country);
    const { suffix } = this.split(symbol);
    return suffix ? this.bySuffix.get(suffix)?.market : this.home;
  }

  currencyOf(symbol: string): string {
    return optionIndex(symbol)?.currency ?? this.marketOf(symbol)?.currency ?? 'USD';
  }

  exchangeOf(symbol: string): string | null {
    const { suffix } = this.split(symbol);
    return suffix ? (this.bySuffix.get(suffix)?.exchange ?? null) : null;
  }

  canonical(ticker: string, exchange?: string | null): string {
    const upper = ticker.toUpperCase();
    if (!exchange) return upper;
    const wanted = exchange.toUpperCase();
    for (const [suffix, entry] of this.bySuffix) {
      if (entry.exchange.toUpperCase() === wanted || entry.mic === wanted) {
        return `${this.split(upper).ticker}.${suffix}`;
      }
    }
    return upper;
  }

  listingIn(ticker: string, code: string): string {
    const market = this.byCode.get(code);
    const { ticker: bare, suffix } = this.split(ticker);
    if (suffix && this.bySuffix.get(suffix)?.market.code === code) return `${bare}.${suffix}`;
    const own = market?.suffixes[0]?.suffix;
    return own ? `${bare}.${own}` : bare;
  }

  listingOf(symbol: string): Listing {
    const index = optionIndex(symbol);
    if (index) {
      return {
        symbol,
        ticker: index.symbol,
        exchange: null,
        mic: null,
        currency: index.currency,
        kind: 'INDEX',
      };
    }
    const { ticker, suffix } = this.split(symbol);
    const venue = suffix ? this.bySuffix.get(suffix) : undefined;
    const market = venue?.market ?? this.home;
    return {
      symbol,
      ticker,
      exchange: venue?.exchange ?? null,
      mic: venue?.mic ?? null,
      currency: market?.currency ?? 'USD',
    };
  }

  symbolOfHit(hit: Pick<SearchHit, 'ticker' | 'exchange' | 'mic'>): string | null {
    const ticker = hit.ticker.trim().toUpperCase();
    if (!ticker) return null;
    const venues = [hit.mic, hit.exchange].filter((v): v is string => !!v).map((v) => v.toUpperCase());
    if (venues.length === 0) return ticker;
    for (const venue of venues) {
      for (const [suffix, entry] of this.bySuffix) {
        if (entry.mic === venue || entry.exchange.toUpperCase() === venue) return `${ticker}.${suffix}`;
      }
    }
    const homeIsUs = this.home?.country === 'US' || this.home?.code === 'US';
    return homeIsUs && venues.some((v) => US_VENUES.has(v)) ? ticker : null;
  }

  clockOf(symbol: string): MarketClock {
    return marketClock(this.marketOf(symbol) ?? US_MARKET);
  }

  groupByMarket(symbols: readonly string[]): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const symbol of symbols) {
      const code = this.marketOf(symbol)?.code ?? '';
      groups.set(code, [...(groups.get(code) ?? []), symbol]);
    }
    return groups;
  }
}

export const DEFAULT_REGISTRY = new MarketRegistry(DEFAULT_MARKETS);

export const marketOfSymbol = (symbol: string): string => DEFAULT_REGISTRY.marketOf(symbol)?.code ?? 'US';
export const listingOf = (symbol: string): Listing => DEFAULT_REGISTRY.listingOf(symbol);
export const symbolOfHit = (hit: Pick<SearchHit, 'ticker' | 'exchange' | 'mic'>): string | null =>
  DEFAULT_REGISTRY.symbolOfHit(hit);
