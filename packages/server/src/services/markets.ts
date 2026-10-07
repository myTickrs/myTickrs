import { BUILT_IN_MARKETS, isValidTimezone, marketClock, MarketRegistry } from '@tickrs/market-data';
import type { MarketDef } from '@tickrs/shared';
import type { Ctx } from '../context.js';
import { AppError } from '../errors.js';
import type { MarketRow, StoreTx } from '../store/ports.js';
import { ensureCurrency, requireCurrency } from './currencies.js';

export function toMarketDef(row: MarketRow): MarketDef {
  return {
    code: row.code,
    name: row.name,
    country: row.country,
    timezone: row.timezone,
    sessions: JSON.parse(row.sessions),
    weekdays: JSON.parse(row.weekdays),
    closedDays: JSON.parse(row.closedDays),
    holidaysThrough: row.holidaysThrough,
    currency: row.currency,
    suffixes: JSON.parse(row.suffixes),
    testSymbol: row.testSymbol,
  };
}

function toMarketRow(
  def: MarketDef,
  position: number,
): Omit<MarketRow, 'userId' | 'createdAt' | 'updatedAt'> {
  return {
    code: def.code,
    position,
    name: def.name,
    country: def.country,
    timezone: def.timezone,
    sessions: JSON.stringify(def.sessions),
    weekdays: JSON.stringify([...new Set(def.weekdays)].toSorted()),
    closedDays: JSON.stringify([...new Set(def.closedDays)].toSorted()),
    holidaysThrough: def.holidaysThrough,
    currency: def.currency,
    suffixes: JSON.stringify(def.suffixes),
    testSymbol: def.testSymbol,
  };
}

const marketCache = new WeakMap<StoreTx, Promise<MarketDef[]>>();

export function loadMarkets(data: StoreTx): Promise<MarketDef[]> {
  let found = marketCache.get(data);
  if (!found) {
    found = (async () => {
      let rows = await data.markets.list();
      if (rows.length === 0) {
        for (const [i, def] of BUILT_IN_MARKETS.entries()) await data.markets.save(toMarketRow(def, i));
        rows = await data.markets.list();
      }
      return rows.map(toMarketDef);
    })();
    marketCache.set(data, found);
    found.catch(() => marketCache.delete(data));
  }
  return found;
}

export async function loadRegistry(data: StoreTx): Promise<MarketRegistry> {
  return new MarketRegistry(await loadMarkets(data));
}

export function forgetMarkets(...scopes: StoreTx[]): void {
  for (const scope of scopes) marketCache.delete(scope);
}

async function tradedSymbols(data: StoreTx): Promise<string[]> {
  const rows = await data.transactions.listForUser();
  return [...new Set(rows.map((r) => r.symbol).filter((s): s is string => Boolean(s)))];
}

export async function listMarkets(ctx: Ctx) {
  const [markets, symbols] = await Promise.all([loadMarkets(ctx.data), tradedSymbols(ctx.data)]);
  const registry = new MarketRegistry(markets);
  const now = new Date(ctx.clock.nowIso());
  return {
    items: markets.map((m) => ({
      ...m,
      isHome: registry.home?.code === m.code,
      openNow: marketClock(m).isOpen(now),
      symbols: symbols.filter((s) => registry.marketOf(s)?.code === m.code).length,
    })),
  };
}

async function checkMarkets(data: StoreTx, before: readonly MarketDef[], after: readonly MarketDef[]) {
  const homes = after.filter((m) => m.suffixes.length === 0);
  if (homes.length !== 1) {
    throw new AppError(
      'MARKET_HOME_REQUIRED',
      422,
      'Exactly one market must have no suffix: it is where tickers without one belong.',
      { markets: homes.map((m) => m.code) },
    );
  }
  const owners = new Map<string, string>();
  for (const market of after) {
    for (const { suffix } of market.suffixes) {
      const owner = owners.get(suffix);
      if (owner && owner !== market.code) {
        throw new AppError('MARKET_SUFFIX_TAKEN', 409, `The suffix .${suffix} already belongs to ${owner}`, {
          suffix,
          market: owner,
        });
      }
      owners.set(suffix, market.code);
    }
  }
  for (const market of after) {
    if (!isValidTimezone(market.timezone)) {
      throw new AppError('VALIDATION_FAILED', 422, `Unknown time zone "${market.timezone}"`, {
        fields: { timezone: 'Unknown time zone' },
      });
    }
    const was = before.find((m) => m.code === market.code);
    if (was?.currency !== market.currency) await requireCurrency(data, market.currency);
  }
  const [was, will] = [new MarketRegistry(before), new MarketRegistry(after)];
  const moved = (await tradedSymbols(data)).filter((s) => was.marketOf(s)?.code !== will.marketOf(s)?.code);
  if (moved.length > 0) {
    throw new AppError(
      'MARKET_IN_USE',
      409,
      `This change would move ${moved.join(', ')} to another market. Remove those transactions first.`,
      { symbols: moved },
    );
  }
}

async function writeMarkets(tx: StoreTx, markets: readonly MarketDef[]) {
  for (const [i, m] of markets.entries()) await tx.markets.save(toMarketRow(m, i));
}

export async function saveMarket(ctx: Ctx, code: string | null, input: MarketDef) {
  const saved = await ctx.store.transaction(ctx.principal, async (tx) => {
    const before = await loadMarkets(tx);
    const index = code == null ? -1 : before.findIndex((m) => m.code === code);
    if (code != null && index < 0) throw new AppError('NOT_FOUND', 404, `No market ${code}`);
    if (code == null && before.some((m) => m.code === input.code)) {
      throw new AppError('MARKET_EXISTS', 409, `There is already a market ${input.code}`);
    }
    const market = { ...input, code: code ?? input.code };
    const after = index < 0 ? [...before, market] : before.with(index, market);
    await ensureCurrency(tx, market.currency);
    await checkMarkets(tx, before, after);
    await writeMarkets(tx, after);
    forgetMarkets(tx);
    return market;
  });
  forgetMarkets(ctx.data);
  return saved;
}

export async function updateMarket(
  ctx: Ctx,
  code: string,
  change: (market: MarketDef) => MarketDef,
): Promise<MarketDef | null> {
  const saved = await ctx.store.transaction(ctx.principal, async (tx) => {
    const markets = await loadMarkets(tx);
    const index = markets.findIndex((m) => m.code === code);
    if (index < 0) return null;
    const market = { ...change(markets[index]!), code };
    await tx.markets.save(toMarketRow(market, index));
    forgetMarkets(tx);
    return market;
  });
  forgetMarkets(ctx.data);
  return saved;
}

export async function deleteMarket(ctx: Ctx, code: string): Promise<void> {
  await ctx.store.transaction(ctx.principal, async (tx) => {
    const before = await loadMarkets(tx);
    if (!before.some((m) => m.code === code)) throw new AppError('NOT_FOUND', 404, `No market ${code}`);
    const after = before.filter((m) => m.code !== code);
    await checkMarkets(tx, before, after);
    await tx.markets.delete(code);
    await tx.marketProviders.resetMarket(code);
    await tx.providerKeys.deleteMarket(code);
    await writeMarkets(tx, after);
    forgetMarkets(tx);
  });
  forgetMarkets(ctx.data);
}
