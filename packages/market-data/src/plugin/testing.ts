import type {
  CorporateActionInfo,
  HostServices,
  Listing,
  OptionListing,
  OptionQuote,
  PriceBar,
  ProviderPlugin,
  Quote,
  SearchHit,
} from './contract.js';
import { fetchJson, isProviderError, ProviderError, toDecimal } from './runtime.js';
import { validatePlugin } from './validate.js';

const quiet = () => {};

export function createTestHost(overrides: Partial<HostServices> = {}): HostServices {
  return {
    fetchJson,
    ProviderError,
    isProviderError,
    toDecimal,
    logger: { debug: quiet, info: quiet, warn: quiet },
    ...overrides,
  };
}

export function listing(ticker: string, rest: Partial<Omit<Listing, 'ticker'>> = {}): Listing {
  return { symbol: ticker, ticker, exchange: null, mic: null, currency: 'USD', ...rest };
}

export interface StubRoute {
  match: string;
  body: unknown;
  status?: number;
  raw?: boolean;
}

export function stubFetch(routes: StubRoute[]): { calls: string[]; restore(): void } {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    const route = routes.find((r) => url.includes(r.match));
    const body = route
      ? route.raw
        ? String(route.body)
        : JSON.stringify(route.body)
      : '{"message":"not stubbed"}';
    return new Response(body, {
      status: route ? (route.status ?? 200) : 404,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { calls, restore: () => void (globalThis.fetch = real) };
}

class ContractError extends Error {
  override name = 'ContractError';
}

function fail(message: string): never {
  throw new ContractError(message);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const isDecimal = (v: unknown) => typeof v === 'string' && toDecimal(v) === v;
const isDecimalOrNull = (v: unknown) => v === null || isDecimal(v);

export function checkPlugin(plugin: ProviderPlugin, apiKey: string | null = 'test-key'): void {
  const problems = validatePlugin(plugin);
  if (problems.length > 0) fail(`invalid plugin: ${problems.join('; ')}`);
  const provider = plugin.create({ apiKey, host: createTestHost() });
  if (provider.id !== plugin.id) fail(`provider.id "${provider.id}" must equal plugin.id "${plugin.id}"`);
  for (const method of [
    'searchSymbols',
    'getLatestQuotes',
    'getDailyPrices',
    'getCorporateActions',
  ] as const) {
    if (typeof provider[method] !== 'function') fail(`provider.${method} must be a function`);
  }
  if (plugin.capabilities.optionQuotes && typeof provider.getOptionQuotes !== 'function') {
    fail('provider.getOptionQuotes must be a function when capabilities.optionQuotes is true');
  }
}

export function optionListing(symbol: string, underlying?: Listing): OptionListing {
  const key = /^([^|]+)|(d{4}-d{2}-d{2})|([CP])|(d+(?:.d+)?)$/.exec(symbol);
  if (key) {
    const [, root, expiration, cp, strike] = key as unknown as [string, string, string, string, string];
    return {
      symbol,
      underlying: underlying ?? listing(root),
      expiration,
      right: cp === 'C' ? 'CALL' : 'PUT',
      strike,
    };
  }
  const m = /^([A-Z0-9.]{1,6})(d{2})(d{2})(d{2})([CP])(d{8})$/.exec(symbol);
  if (!m) throw new Error(`"${symbol}" is neither a compact OCC symbol nor a contract key`);
  const [, root, yy, mm, dd, cp, strike] = m as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  return {
    symbol,
    underlying: underlying ?? listing(root),
    expiration: `20${yy}-${mm}-${dd}`,
    right: cp === 'C' ? 'CALL' : 'PUT',
    strike: toDecimal(Number(strike) / 1000) ?? '0',
  };
}

export function checkOptionQuotes(quotes: OptionQuote[], requested: readonly OptionListing[]): void {
  const allowed = new Set(requested.map((o) => o.symbol));
  const seen = new Set<string>();
  for (const q of quotes) {
    if (!allowed.has(q.symbol)) fail(`option quote for "${q.symbol}", which was not requested (echo symbol)`);
    if (seen.has(q.symbol)) fail(`more than one option quote for "${q.symbol}"`);
    seen.add(q.symbol);
    if (q.bid === null && q.ask === null && q.last === null) {
      fail(`option quote ${q.symbol}: needs a bid, an ask or a last price`);
    }
    for (const k of [
      'bid',
      'ask',
      'last',
      'mark',
      'volume',
      'openInterest',
      'iv',
      'delta',
      'gamma',
      'theta',
      'vega',
      'previousClose',
    ] as const) {
      if (!isDecimalOrNull(q[k] ?? null))
        fail(`option quote ${q.symbol}: ${k} must be a decimal string or null`);
    }
    if (!ISO_UTC.test(q.asOf)) fail(`option quote ${q.symbol}: asOf must be ISO-8601 UTC, got "${q.asOf}"`);
  }
}

export function checkQuotes(quotes: Quote[], requested: readonly Listing[]): void {
  const allowed = new Set(requested.map((l) => l.symbol));
  const seen = new Set<string>();
  for (const q of quotes) {
    if (!allowed.has(q.symbol))
      fail(`quote for "${q.symbol}", which was not requested (echo listing.symbol)`);
    if (seen.has(q.symbol)) fail(`more than one quote for "${q.symbol}"`);
    seen.add(q.symbol);
    if (!isDecimal(q.price) || q.price === '0')
      fail(`quote ${q.symbol}: price must be a non-zero decimal string`);
    if (!isDecimalOrNull(q.change)) fail(`quote ${q.symbol}: change must be a decimal string or null`);
    if (!isDecimalOrNull(q.changePct)) fail(`quote ${q.symbol}: changePct must be a decimal string or null`);
    for (const k of ['open', 'high', 'low', 'previousClose'] as const) {
      if (!isDecimalOrNull(q[k] ?? null)) fail(`quote ${q.symbol}: ${k} must be a decimal string or null`);
    }
    if (!ISO_UTC.test(q.asOf)) fail(`quote ${q.symbol}: asOf must be ISO-8601 UTC, got "${q.asOf}"`);
  }
}

export function checkBars(bars: PriceBar[]): void {
  let previous = '';
  for (const b of bars) {
    if (!DATE.test(b.date)) fail(`bar date must be YYYY-MM-DD, got "${b.date}"`);
    if (b.date <= previous) fail(`bars must be ascending and unique by date (${previous} then ${b.date})`);
    previous = b.date;
    if (!isDecimal(b.close)) fail(`bar ${b.date}: close must be a decimal string`);
    for (const k of ['open', 'high', 'low', 'volume'] as const) {
      if (!isDecimalOrNull(b[k])) fail(`bar ${b.date}: ${k} must be a decimal string or null`);
    }
  }
}

export function checkActions(actions: CorporateActionInfo[], of: Listing): void {
  let previous = '';
  for (const a of actions) {
    if (a.symbol !== of.symbol) fail(`action symbol "${a.symbol}" must be listing.symbol "${of.symbol}"`);
    if (!DATE.test(a.date)) fail(`action date must be YYYY-MM-DD, got "${a.date}"`);
    if (a.date < previous) fail('actions must be ascending by date');
    previous = a.date;
    if (a.type === 'SPLIT') {
      if (!isDecimal(a.ratioFrom) || !isDecimal(a.ratioTo))
        fail(`split ${a.date}: ratios must be decimal strings`);
      if (a.amount !== null) fail(`split ${a.date}: amount must be null`);
    } else if (a.type === 'DIVIDEND') {
      if (!isDecimal(a.amount)) fail(`dividend ${a.date}: amount must be a decimal string`);
      if (a.ratioFrom !== null || a.ratioTo !== null) fail(`dividend ${a.date}: ratios must be null`);
    } else {
      fail(`unknown action type "${String(a.type)}"`);
    }
  }
}

export function checkSearchHits(hits: SearchHit[]): void {
  if (hits.length > 20) fail(`search returned ${hits.length} hits; at most 20`);
  for (const h of hits) {
    if (!h.ticker) fail('search hit without a ticker');
    if (!h.name) fail(`search hit ${h.ticker} without a name`);
    if (h.type !== 'STOCK' && h.type !== 'ETF') fail(`search hit ${h.ticker}: type must be STOCK or ETF`);
    if (h.mic !== null && !/^[A-Z0-9]{4}$/.test(h.mic))
      fail(`search hit ${h.ticker}: mic must be 4 characters`);
  }
}
