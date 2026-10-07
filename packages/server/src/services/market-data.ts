import type { Logger } from 'pino';
import type { Store, StoreTx } from '../store/ports.js';
import { createContext, type Ctx, type Principal } from '../context.js';
import type { StockDataProviderId } from '@tickrs/shared';
import type { IsoDate } from '../model.js';
import { nowIso } from '../ids.js';
import { fitBudget, isStale, providerRegistry } from '@tickrs/market-data';
import { chargedRequests, unquotableKey, unquotableOn } from './quote-usage.js';
import type { StockDataRouter } from '@tickrs/market-data';
import type { SecurityInfo } from '@tickrs/market-data';
import { loadRegistry } from './markets.js';
import { ensureOptionQuotes } from './option-quotes.js';
import { buildBaseRouter, buildRouter, type CryptoConfig } from './providers.js';

export interface RefreshResult {
  refreshed: string[];
  pendingSymbols: string[];
  provider: StockDataProviderId | null;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const quoting = new Map<string, Promise<unknown>>();
const backfilling = new Map<string, Promise<unknown>>();

async function singleFlight<T>(
  inFlight: Map<string, Promise<unknown>>,
  symbols: readonly string[],
  stillNeeded: (waited: string[]) => Promise<string[]>,
  fetch: (symbols: string[]) => Promise<T>,
): Promise<{ settled: string[]; result: T }> {
  const busy = symbols.filter((s) => inFlight.has(s));
  let todo = [...symbols];
  let settled: string[] = [];
  if (busy.length > 0) {
    await Promise.allSettled(busy.map((s) => inFlight.get(s)));
    const still = new Set(await stillNeeded(busy));
    settled = busy.filter((s) => !still.has(s));
    todo = todo.filter((s) => !settled.includes(s));
  }
  const flight = fetch(todo);
  const held = todo.filter((s) => !inFlight.has(s));
  for (const s of held) inFlight.set(s, flight);
  try {
    return { settled, result: await flight };
  } finally {
    for (const s of held) if (inFlight.get(s) === flight) inFlight.delete(s);
  }
}

async function tradedSymbols(data: StoreTx): Promise<string[]> {
  const rows = await data.transactions.listForUser();
  return [...new Set(rows.map((r) => r.symbol).filter((s): s is string => s != null))];
}

export async function ensureQuotes(
  ctx: Ctx,
  symbols: readonly string[],
  router?: StockDataRouter,
): Promise<RefreshResult> {
  const data = ctx.data;
  const wanted = [...new Set(symbols)].filter(Boolean);
  if (wanted.length === 0) return { refreshed: [], pendingSymbols: [], provider: null };

  const registry = await loadRegistry(data);
  const now = new Date(ctx.clock.nowIso());
  const staleOf = async (list: readonly string[]) => {
    const cached = await data.prices.quoteTimes(list);
    const fresh = new Set(
      cached
        .filter((c) => !isStale(c.fetchedAt, registry.clockOf(c.symbol).quoteTtlMs(now), now))
        .map((c) => c.symbol),
    );
    return list.filter((s) => !fresh.has(s));
  };
  const stale = await staleOf(wanted);
  if (stale.length === 0) return { refreshed: [], pendingSymbols: [], provider: null };

  const { settled, result } = await singleFlight(quoting, stale, staleOf, (todo) =>
    fetchQuotes(ctx, registry, now, todo, router),
  );
  return { ...result, refreshed: [...settled, ...result.refreshed] };
}

async function fetchQuotes(
  ctx: Ctx,
  registry: Awaited<ReturnType<typeof loadRegistry>>,
  now: Date,
  stale: readonly string[],
  router?: StockDataRouter,
  baseFor: 'unpriced' | 'all' = 'unpriced',
): Promise<RefreshResult> {
  const data = ctx.data;
  const userId = ctx.principal.userId;
  if (stale.length === 0) return { refreshed: [], pendingSymbols: [], provider: null };
  const dataRouter = router ?? (await buildRouter(ctx));
  const base = providerRegistry.baseProvider();
  const priced = new Set((await data.prices.quoteTimes(stale)).map((c) => c.symbol));
  const baseMay = (s: string) => baseFor === 'all' || !priced.has(s);
  const refreshed: string[] = [];
  const hopeless = new Set<string>();
  let provider: StockDataProviderId | null = null;
  for (const [market, group] of registry.groupByMarket(stale)) {
    const skip = unquotableOn(market, registry.clockOf(group[0]!).date(now));
    const tried = new Set<string>();
    let ask = group;
    while (ask.length > 0) {
      const outcome = await dataRouter.run(
        'quotes',
        async (p, keyMarket) => {
          const known = ask.filter((s) => skip.has(unquotableKey(userId, p.id, keyMarket, s)));
          const offered = ask.filter((s) => !known.includes(s) && (p.id !== base || baseMay(s)));
          const budget = await data.usage.remainingBudget(p.id, keyMarket);
          const batch = fitBudget(p.id, 'quotes', offered, budget);
          const meter = { requests: 0 };
          if (batch.length === 0) return { quotes: [], batch, known, requests: 0 };
          const quotes = await p.getLatestQuotes(batch, meter);
          return { quotes, batch, known, requests: chargedRequests(p.id, 'quotes', batch, meter) };
        },
        {
          market,
          allow: (p, keyMarket) =>
            !tried.has(`${p.id}@${keyMarket}`) && data.usage.hasDailyHeadroom(p.id, keyMarket),
        },
      );
      if (!outcome) break;
      tried.add(`${outcome.provider}@${outcome.market}`);
      const { quotes, batch, known, requests } = outcome.result;
      if (outcome.provider !== base || batch.length > 0) provider ??= outcome.provider;

      await data.usage.record(outcome.provider, outcome.market, requests);
      if (quotes.length > 0) {
        await data.prices.upsertLatest(
          quotes.map((q) => ({
            symbol: q.symbol,
            price: q.price,
            change: q.change,
            changePct: q.changePct,
            open: q.open,
            high: q.high,
            low: q.low,
            previousClose: q.previousClose,
            source: outcome.provider,
            asOf: q.asOf,
            fetchedAt: now.toISOString(),
          })),
        );
      }
      const quoted = new Set(quotes.map((q) => q.symbol));
      refreshed.push(...quoted);
      const missed = batch.filter((s) => !quoted.has(s));
      for (const s of missed) skip.add(unquotableKey(userId, outcome.provider, outcome.market, s));
      ask = [...known, ...missed];
    }
    const quoters = dataRouter.candidates('quotes', market);
    if (quoters.length === 0) continue;
    for (const s of group) {
      const askable = quoters.filter((c) => c.provider.id !== base || baseMay(s));
      if (askable.every((c) => skip.has(unquotableKey(userId, c.provider.id, c.market, s)))) hopeless.add(s);
    }
  }
  return {
    refreshed,
    pendingSymbols: stale.filter((s) => !refreshed.includes(s) && !hopeless.has(s)),
    provider,
  };
}

export const BASE_SWEEP_INTERVAL_MS = 8 * 60_000;

export interface BaseSweepDeps {
  store: Store;
  crypto: CryptoConfig;
  principals(): Promise<readonly Principal[]>;
  logger?: Logger;
}

export async function sweepBaseQuotes(deps: BaseSweepDeps): Promise<{ refreshed: string[] }> {
  const { store, crypto, logger } = deps;
  const refreshed: string[] = [];
  let refreshedOptions = 0;
  const seen = new Set<string>();
  try {
    for (const principal of await deps.principals()) {
      try {
        const ctx = createContext({ store, crypto, principal });
        const router = await buildBaseRouter(ctx.data);
        if (!router) return { refreshed };
        const registry = await loadRegistry(ctx.data);
        const now = new Date(ctx.clock.nowIso());
        const held = (await tradedSymbols(ctx.data)).filter((s) => !seen.has(s));
        for (const s of held) seen.add(s);
        const dueOf = async (list: readonly string[]) => {
          const cached = new Map(
            (await ctx.data.prices.quoteTimes(list)).map((c) => [c.symbol, c.fetchedAt]),
          );
          return list.filter((s) => {
            const at = cached.get(s);
            const ttl = Math.max(BASE_SWEEP_INTERVAL_MS, registry.clockOf(s).quoteTtlMs(now));
            return !at || isStale(at, ttl, now);
          });
        };
        const due = await dueOf(held);
        if (due.length > 0) {
          const { settled, result } = await singleFlight(quoting, due, dueOf, (todo) =>
            fetchQuotes(ctx, registry, now, todo, router, 'all'),
          );
          refreshed.push(...settled, ...result.refreshed);
        }
        if (router.has('optionQuotes')) {
          const options = await ensureOptionQuotes(ctx, router);
          refreshedOptions += options.refreshed.length;
        }
      } catch (err) {
        logger?.warn({ err, userId: principal.userId }, 'Base-provider quote sweep failed for a user');
      }
    }
  } catch (err) {
    logger?.warn({ err }, 'Could not list the users for the base-provider quote sweep');
  }
  if (refreshed.length > 0 || refreshedOptions > 0) {
    logger?.info({ symbols: refreshed.length, options: refreshedOptions }, 'Base-provider quotes refreshed');
  }
  return { refreshed };
}

export function startBaseQuoteSweep(deps: BaseSweepDeps): () => void {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await sweepBaseQuotes(deps);
    } finally {
      running = false;
    }
  };
  void run();
  const interval = setInterval(() => void run(), BASE_SWEEP_INTERVAL_MS);
  interval.unref?.();
  return () => clearInterval(interval);
}

export async function ensureHistory(
  ctx: Ctx,
  symbols: readonly string[],
  from: IsoDate,
  to: IsoDate = todayIso(),
  maxSymbols = 8,
): Promise<RefreshResult> {
  const data = ctx.data;
  const wanted = [...new Set(symbols)].filter(Boolean);
  if (wanted.length === 0) return { refreshed: [], pendingSymbols: [], provider: null };

  const registry = await loadRegistry(data);
  const now = new Date(ctx.clock.nowIso());
  const missingOf = async (list: readonly string[]) => {
    const coverage = await data.prices.coverage(list);
    const bySymbol = new Map(coverage.map((c) => [c.symbol, c]));
    return list.filter((s) => {
      const clock = registry.clockOf(s);
      const completed = clock.lastCompletedTradingDay(now);
      const asked = clock.lastTradingDay(to);
      const current = asked < completed ? asked : completed;
      const c = bySymbol.get(s);
      return !c || String(c.first) > from || String(c.last) < current;
    });
  };
  const missing = await missingOf(wanted);
  if (missing.length === 0) return { refreshed: [], pendingSymbols: [], provider: null };

  const { settled, result } = await singleFlight(backfilling, missing, missingOf, (todo) =>
    fetchHistory(ctx, registry, todo, from, to, maxSymbols),
  );
  return { ...result, refreshed: [...settled, ...result.refreshed] };
}

async function fetchHistory(
  ctx: Ctx,
  registry: Awaited<ReturnType<typeof loadRegistry>>,
  missing: readonly string[],
  from: IsoDate,
  to: IsoDate,
  maxSymbols: number,
): Promise<RefreshResult> {
  const data = ctx.data;
  if (missing.length === 0) return { refreshed: [], pendingSymbols: [], provider: null };
  const router = await buildRouter(ctx);
  const refreshed: string[] = [];
  let provider: StockDataProviderId | null = null;
  const served = missing.filter((s) => router.has('history', registry.marketOf(s)?.code ?? ''));
  for (const symbol of served.slice(0, maxSymbols)) {
    const outcome = await router.run(
      'history',
      async (p, keyMarket) => {
        const budget = await data.usage.remainingBudget(p.id, keyMarket);
        if (budget < 1) return null;
        return { bars: await p.getDailyPrices(symbol, from, to), id: p.id };
      },
      {
        market: registry.marketOf(symbol)?.code ?? '',
        allow: (p, keyMarket) => data.usage.hasDailyHeadroom(p.id, keyMarket),
      },
    );
    if (!outcome) continue;
    if (!outcome.result) break;
    provider = outcome.provider;
    await data.usage.record(outcome.provider, outcome.market, 1);
    const bars = outcome.result.bars;
    if (bars.length > 0) {
      await data.prices.upsertDaily(
        bars.map((b) => ({
          symbol,
          date: b.date,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          adjClose: null,
          volume: b.volume,
          source: outcome.provider,
        })),
      );
    }
    refreshed.push(symbol);
  }
  return { refreshed, pendingSymbols: missing.filter((s) => !refreshed.includes(s)), provider };
}

export async function searchSymbols(ctx: Ctx, query: string) {
  const data = ctx.data;
  const [router, registry] = await Promise.all([buildRouter(ctx), loadRegistry(data)]);
  const tag = <T extends { symbol: string }>(item: T) => ({
    ...item,
    market: registry.marketOf(item.symbol)?.code ?? null,
  });
  if (router.has('search')) {
    const outcome = await router.run('search', (p) => p.searchSymbols(query));
    if (outcome) {
      await data.usage.record(outcome.provider, outcome.market, 1);
      return { source: outcome.provider, items: (outcome.result satisfies SecurityInfo[]).map(tag) };
    }
  }
  const local = await data.securities.search(query);
  return {
    source: 'local' as const,
    items: local.map((s) =>
      tag({
        symbol: s.symbol,
        name: s.name,
        exchange: s.exchange,
        currency: s.currency,
        type: s.type,
      }),
    ),
  };
}

export async function refreshPortfolioData(ctx: Ctx) {
  const symbols = await tradedSymbols(ctx.data);
  const router = await buildRouter(ctx);
  const quotes = await ensureQuotes(ctx, symbols, router);
  const options = await ensureOptionQuotes(ctx, router);
  const registry = await loadRegistry(ctx.data);
  return {
    quotes,
    options,
    symbols,
    exchanges: Object.fromEntries(symbols.map((s) => [s, registry.exchangeOf(s)])),
    checkedAt: nowIso(),
  };
}

export async function getMarketDataStatus(ctx: Ctx) {
  const data = ctx.data;
  const symbols = await tradedSymbols(data);
  const accounts = await data.accounts.ids();
  const from = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const history = await ensureHistory(ctx, symbols, from);
  const [router, registry] = await Promise.all([buildRouter(ctx), loadRegistry(data)]);
  const noProvider = [...new Set(symbols.map((s) => registry.marketOf(s)?.code ?? ''))]
    .filter((m) => !router.has('quotes', m))
    .toSorted();
  return {
    noProvider,
    accounts: accounts.length,
    symbols: symbols.length,
    loaded: symbols.length - history.pendingSymbols.length,
    pendingSymbols: history.pendingSymbols,
    provider: history.provider,
  };
}
