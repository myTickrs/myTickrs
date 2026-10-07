import { addDays, positionSide, replay, type EffectiveContract } from '@tickrs/core';
import { fitBudget, isStale, type MarketRegistry } from '@tickrs/market-data';
import type { OptionQuoteInfo, OptionQuoteRequest, StockDataRouter } from '@tickrs/market-data';
import { formatContractKey, formatOccSymbol, type StockDataProviderId } from '@tickrs/shared';
import type { Ctx } from '../context.js';
import type { Uuid } from '../model.js';
import { loadLedgerContext } from './ledger-context.js';
import { chargedRequests, unquotableKey, unquotableOn } from './quote-usage.js';
import { loadRegistry } from './markets.js';
import { buildRouter } from './providers.js';

export const OPTION_QUOTE_TTL_MS = 15 * 60_000;

export interface OptionRefreshResult {
  refreshed: Uuid[];
  pending: Uuid[];
  provider: StockDataProviderId | null;
}

interface Wanted {
  contractId: Uuid;
  request: OptionQuoteRequest;
}

export function quoteSymbolOf(contract: EffectiveContract, registry: MarketRegistry): string {
  if (contract.quoteSymbol) return contract.quoteSymbol.replaceAll(' ', '').toUpperCase();
  const o = contract.original;
  if (registry.marketOf(o.underlying)?.country !== 'US') return formatContractKey(o);
  const root = registry.listingOf(o.underlying).ticker.replaceAll(/[^A-Za-z0-9]/g, '');
  return formatOccSymbol({
    underlying: root,
    expiration: o.expiration,
    right: o.right,
    strike: o.strike,
  }).replaceAll(' ', '');
}

async function openContracts(ctx: Ctx, registry: MarketRegistry, now: Date): Promise<EffectiveContract[]> {
  const ledgerCtx = await loadLedgerContext(ctx.data);
  const ledger = replay(ledgerCtx.txns, ledgerCtx.opts);
  const open: EffectiveContract[] = [];
  for (const pos of ledger.options.values()) {
    const contract = ledgerCtx.contracts.get(pos.contractId);
    if (!contract || !positionSide(pos.lots)) continue;
    if (contract.expiration >= registry.clockOf(contract.underlying).date(now)) open.push(contract);
  }
  return open;
}

export async function ensureOptionQuotes(ctx: Ctx, router?: StockDataRouter): Promise<OptionRefreshResult> {
  const none: OptionRefreshResult = { refreshed: [], pending: [], provider: null };
  const data = ctx.data;
  const now = new Date(ctx.clock.nowIso());
  const registry = await loadRegistry(data);
  const contracts = await openContracts(ctx, registry, now);
  if (contracts.length === 0) return none;
  const fetched = new Map(
    (await data.optionQuotes.quoteTimes(contracts.map((c) => c.id))).map((r) => [
      r.optionContractId,
      r.fetchedAt,
    ]),
  );
  const stale = contracts.filter((c) => {
    const at = fetched.get(c.id);
    const ttl = Math.max(OPTION_QUOTE_TTL_MS, registry.clockOf(c.underlying).quoteTtlMs(now));
    return !at || isStale(at, ttl, now);
  });
  if (stale.length === 0) return none;

  const dataRouter = router ?? (await buildRouter(ctx));
  const userId = ctx.principal.userId;
  const skipKey = (provider: string, keyMarket: string, w: Wanted) =>
    unquotableKey(userId, provider, keyMarket, `option:${w.request.symbol}`);
  const refreshed: Uuid[] = [];
  const pending = new Set<Uuid>();
  let provider: StockDataProviderId | null = null;

  const byMarket = new Map<string, Wanted[]>();
  for (const c of stale) {
    const market = registry.marketOf(c.underlying)?.code ?? '';
    const request: OptionQuoteRequest = {
      symbol: quoteSymbolOf(c, registry),
      underlying: c.underlying,
      expiration: c.expiration,
      right: c.right,
      strike: c.strike,
    };
    byMarket.set(market, [...(byMarket.get(market) ?? []), { contractId: c.id, request }]);
  }

  for (const [market, group] of byMarket) {
    const skip = unquotableOn(market, registry.clockOf(group[0]!.request.underlying).date(now));
    const underlyingOf = new Map(group.map((w) => [w.request.symbol, w.request.underlying]));
    const underlying = (symbol: string) => underlyingOf.get(symbol) ?? symbol;
    const tried = new Set<string>();
    let ask = group;
    while (ask.length > 0) {
      const outcome = await dataRouter.run(
        'optionQuotes',
        async (p, keyMarket) => {
          const known = ask.filter((w) => skip.has(skipKey(p.id, keyMarket, w)));
          const offered = ask.filter((w) => !known.includes(w));
          const budget = await data.usage.remainingBudget(p.id, keyMarket);
          const fit = new Set(
            fitBudget(
              p.id,
              'optionQuotes',
              offered.map((w) => w.request.symbol),
              budget,
              underlying,
            ),
          );
          const batch = offered.filter((w) => fit.has(w.request.symbol));
          const left = offered.filter((w) => !fit.has(w.request.symbol));
          if (batch.length === 0 || !p.getOptionQuotes) {
            return { quotes: [] as OptionQuoteInfo[], batch: [] as Wanted[], known, left, requests: 0 };
          }
          const meter = { requests: 0 };
          const quotes = await p.getOptionQuotes(
            batch.map((w) => w.request),
            meter,
          );
          const symbols = batch.map((w) => w.request.symbol);
          return {
            quotes,
            batch,
            known,
            left,
            requests: chargedRequests(p.id, 'optionQuotes', symbols, meter, underlying),
          };
        },
        {
          market,
          allow: (p, keyMarket) =>
            !tried.has(`${p.id}@${keyMarket}`) && data.usage.hasDailyHeadroom(p.id, keyMarket),
        },
      );
      if (!outcome) break;
      tried.add(`${outcome.provider}@${outcome.market}`);
      const { quotes, batch, known, left, requests } = outcome.result;
      if (batch.length > 0) provider ??= outcome.provider;
      await data.usage.record(outcome.provider, outcome.market, requests);

      const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
      const stillOpen = new Set((await openContracts(ctx, registry, now)).map((c) => c.id));
      const rows = batch.flatMap((w) => {
        const q = bySymbol.get(w.request.symbol);
        return q && stillOpen.has(w.contractId) ? [{ w, q }] : [];
      });
      if (rows.length > 0) {
        const fetchedAt = now.toISOString();
        await data.optionQuotes.upsertLatest(
          rows.map(({ w, q }) => ({
            optionContractId: w.contractId,
            bid: q.bid,
            ask: q.ask,
            last: q.last,
            mark: q.mark,
            iv: q.iv,
            delta: q.delta,
            gamma: q.gamma,
            theta: q.theta,
            vega: q.vega,
            previousClose: q.previousClose,
            source: outcome.provider,
            asOf: q.asOf,
            fetchedAt,
          })),
        );
        await data.optionQuotes.upsertDaily(
          rows.map(({ w, q }) => ({
            optionContractId: w.contractId,
            date: registry.clockOf(w.request.underlying).date(new Date(q.asOf)),
            bid: q.bid,
            ask: q.ask,
            last: q.last,
            mark: q.mark,
            volume: q.volume,
            openInterest: q.openInterest,
            iv: q.iv,
            delta: q.delta,
            theta: q.theta,
            source: outcome.provider,
          })),
        );
        await data.optionQuotes.addDaily(
          rows.flatMap(({ w, q }) => {
            if (q.previousClose == null) return [];
            const clock = registry.clockOf(w.request.underlying);
            const session = clock.date(new Date(q.asOf));
            return [
              {
                optionContractId: w.contractId,
                date: clock.lastTradingDay(addDays(session, -1)),
                bid: null,
                ask: null,
                last: q.previousClose,
                mark: null,
                volume: null,
                openInterest: null,
                iv: null,
                delta: null,
                theta: null,
                source: outcome.provider,
              },
            ];
          }),
        );
      }
      const quoted = new Set(rows.map((r) => r.w.contractId));
      refreshed.push(...quoted);
      const open = (w: Wanted) => stillOpen.has(w.contractId);
      const missed = batch.filter((w) => open(w) && !quoted.has(w.contractId));
      for (const w of missed) skip.add(skipKey(outcome.provider, outcome.market, w));
      for (const w of left.filter(open)) pending.add(w.contractId);
      ask = [...known.filter(open), ...missed];
    }
  }
  return { refreshed, pending: [...pending].filter((id) => !refreshed.includes(id)), provider };
}
