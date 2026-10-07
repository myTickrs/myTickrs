import type { StoreTx } from '../store/ports.js';
import type { Ctx } from '../context.js';
import {
  addDays,
  type DatedPrice,
  dec,
  type Dec,
  type Ledger,
  replay,
  type PriceLookup,
  type QuoteInput,
  quoteMark,
  resolveMark,
  valueLedger,
  type PortfolioValuation,
} from '@tickrs/core';
import type { MarketClock, MarketRegistry } from '@tickrs/market-data';
import type { IsoDate, Uuid } from '../model.js';
import { type LedgerContext, loadLedgerContext } from './ledger-context.js';
import { loadRegistry } from './markets.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

export function rateToBase(ledgerCtx: LedgerContext, currency: string, date: IsoDate = todayIso()): Dec {
  if (currency === ledgerCtx.user.baseCurrency) return dec('1');
  return dec(ledgerCtx.fx(currency, ledgerCtx.user.baseCurrency, date) ?? '1');
}

export interface LatestQuote {
  price: string;
  change: string | null;
  open?: string | null;
  high?: string | null;
  low?: string | null;
  previousClose?: string | null;
  asOf: string;
}

export interface DayQuote {
  price: string;
  date: IsoDate;
  previousClose: string | null;
  change: string | null;
  changePct: string | null;
  open: string | null;
  high: string | null;
  low: string | null;
  estimated: boolean;
}

export function dayQuote(
  latest: LatestQuote | undefined,
  closes: readonly { date: IsoDate; close: string }[],
  today: IsoDate,
  clock: Pick<MarketClock, 'date'>,
): DayQuote | null {
  const closeBefore = (date: IsoDate) => closes.findLast((c) => c.date < date)?.close ?? null;
  let price: string;
  let date: IsoDate;
  let previousClose: string | null;
  if (latest) {
    price = latest.price;
    date = clock.date(new Date(latest.asOf));
    previousClose =
      latest.previousClose ??
      (latest.change != null ? dec(price).minus(latest.change).toFixed() : closeBefore(date));
  } else {
    const last = closes.findLast((c) => c.date <= today);
    if (!last) return null;
    price = last.close;
    date = last.date;
    previousClose = closeBefore(date);
  }
  const change = previousClose == null ? null : dec(price).minus(previousClose);
  const changePct =
    change && previousClose != null && dec(previousClose).gt(0) ? change.div(previousClose) : null;
  return {
    price,
    date,
    previousClose,
    change: change?.toFixed() ?? null,
    changePct: changePct?.toFixed() ?? null,
    open: latest?.open ?? null,
    high: latest?.high ?? null,
    low: latest?.low ?? null,
    estimated: !latest,
  };
}

interface LatestOptionQuote extends Omit<QuoteInput, 'date'> {
  previousClose: string | null;
  asOf: string;
}

interface PriceCaches {
  stockLatest: Map<string, LatestQuote>;
  stockDaily: Map<string, { date: IsoDate; close: string }[]>;
  optionQuotes: Map<string, QuoteInput[]>;
  optionLatest: Map<string, LatestOptionQuote>;
  manualMarks: Map<string, DatedPrice[]>;
}

async function loadPriceCaches(data: StoreTx): Promise<PriceCaches> {
  const [latest, daily, quotesLatest, quotesDaily, marks] = await Promise.all([
    data.prices.latest(),
    data.prices.dailyCloses(),
    data.optionQuotes.latest(),
    data.optionQuotes.daily(),
    data.optionQuotes.manualMarks(),
  ]);

  const stockDaily = new Map<string, { date: IsoDate; close: string }[]>();
  for (const row of daily) {
    const list = stockDaily.get(row.symbol) ?? [];
    list.push({ date: row.date, close: row.close });
    stockDaily.set(row.symbol, list);
  }
  const optionQuotes = new Map<string, QuoteInput[]>();
  for (const q of quotesDaily) {
    const list = optionQuotes.get(q.optionContractId) ?? [];
    list.push({ date: q.date, mark: q.mark, bid: q.bid, ask: q.ask, last: q.last });
    optionQuotes.set(q.optionContractId, list);
  }
  return {
    stockLatest: new Map(
      latest.map((r) => [
        r.symbol,
        { price: r.price, change: r.change, previousClose: r.previousClose, asOf: r.asOf },
      ]),
    ),
    stockDaily,
    optionQuotes,
    optionLatest: new Map(
      quotesLatest.map((q) => [
        q.optionContractId,
        { mark: q.mark, bid: q.bid, ask: q.ask, last: q.last, previousClose: q.previousClose, asOf: q.asOf },
      ]),
    ),
    manualMarks: new Map(marks.map((m) => [m.optionContractId, [{ date: m.asOf, price: m.mark }]])),
  };
}

function lastClose(caches: PriceCaches, symbol: string, date: IsoDate) {
  let found: { date: IsoDate; close: string } | null = null;
  for (const row of caches.stockDaily.get(symbol) ?? []) {
    if (row.date > date) break;
    found = row;
  }
  return found;
}

function closeOn(caches: PriceCaches, symbol: string, date: IsoDate): string | null {
  const found = lastClose(caches, symbol, date)?.close;
  if (found) return found;
  const latest = caches.stockLatest.get(symbol);
  return latest && latest.asOf.slice(0, 10) <= date
    ? latest.price
    : (caches.stockLatest.get(symbol)?.price ?? null);
}

function tradesByContractOf(ledgerCtx: LedgerContext): Map<string, DatedPrice[]> {
  const tradesByContract = new Map<string, DatedPrice[]>();
  for (const row of ledgerCtx.rows) {
    if (!row.optionContractId || row.price == null || row.assetClass !== 'OPTION') continue;
    if (!['BTO', 'STO', 'BTC', 'STC'].includes(row.type)) continue;
    const list = tradesByContract.get(row.optionContractId) ?? [];
    list.push({ date: row.tradeDate, price: row.price });
    tradesByContract.set(row.optionContractId, list);
  }
  return tradesByContract;
}

function optionInputs(
  caches: PriceCaches,
  ledgerCtx: LedgerContext,
  trades: Map<string, DatedPrice[]>,
  registry: MarketRegistry,
  contractId: string,
) {
  const contract = ledgerCtx.contracts.get(contractId);
  if (!contract) return null;
  const clock = registry.clockOf(contract.underlying);
  const latest = caches.optionLatest.get(contractId);
  const daily = caches.optionQuotes.get(contractId) ?? [];
  return {
    clock,
    latest,
    inputs: {
      contract,
      quotes: latest ? [...daily, { ...latest, date: clock.date(new Date(latest.asOf)) }] : daily,
      manualMarks: caches.manualMarks.get(contractId) ?? [],
      trades: trades.get(contractId) ?? [],
      underlyingClose: (d: IsoDate) => closeOn(caches, contract.underlying, d),
    },
  };
}

export function isStalePrice(registry: MarketRegistry, symbol: string, day: IsoDate, now: Date): boolean {
  return day < registry.clockOf(symbol).lastCompletedTradingDay(now);
}

function priceLookup(
  caches: PriceCaches,
  ledgerCtx: LedgerContext,
  registry: MarketRegistry,
  now: Date,
): PriceLookup {
  const trades = tradesByContractOf(ledgerCtx);
  const date = now.toISOString().slice(0, 10);
  return {
    stock: (symbol) => {
      const latest = caches.stockLatest.get(symbol);
      if (latest) {
        const asOf = registry.clockOf(symbol).date(new Date(latest.asOf));
        return { price: latest.price, estimated: isStalePrice(registry, symbol, asOf, now), asOf };
      }
      const close = lastClose(caches, symbol, registry.clockOf(symbol).date(now));
      return close ? { price: close.close, estimated: true, asOf: close.date } : null;
    },
    option: (contractId) => {
      const found = optionInputs(caches, ledgerCtx, trades, registry, contractId);
      if (!found) return null;
      const resolved = resolveMark(found.clock.date(now), found.inputs);
      return {
        mark: resolved.mark,
        estimated: resolved.isEstimated,
        source: resolved.source,
        asOf: resolved.asOf,
      };
    },
    fx: (currency) => {
      const rate = ledgerCtx.fx(currency, ledgerCtx.user.baseCurrency, date);
      return rate ? { rate, estimated: false } : null;
    },
  };
}

export async function buildPriceLookup(
  data: StoreTx,
  ledgerCtx: LedgerContext,
  now: Date = new Date(),
): Promise<PriceLookup> {
  const [caches, registry] = await Promise.all([loadPriceCaches(data), loadRegistry(data)]);
  return priceLookup(caches, ledgerCtx, registry, now);
}

function previousPriceLookup(
  caches: PriceCaches,
  ledgerCtx: LedgerContext,
  current: PriceLookup,
  registry: MarketRegistry,
  now: Date,
): PriceLookup {
  const trades = tradesByContractOf(ledgerCtx);
  return {
    stock: (symbol) => {
      const clock = registry.clockOf(symbol);
      const quote = dayQuote(
        caches.stockLatest.get(symbol),
        caches.stockDaily.get(symbol) ?? [],
        clock.date(now),
        clock,
      );
      return quote?.previousClose != null ? { price: quote.previousClose } : current.stock(symbol);
    },
    option: (contractId) => {
      const found = optionInputs(caches, ledgerCtx, trades, registry, contractId);
      if (!found) return current.option(contractId);
      const { clock, latest, inputs } = found;
      if (latest?.previousClose != null) return { mark: latest.previousClose, source: 'QUOTE' };
      const session = latest ? clock.date(new Date(latest.asOf)) : clock.lastTradingDay(clock.date(now));
      const day = clock.lastTradingDay(addDays(session, -1));
      const manual = inputs.manualMarks.find((m) => m.date === day)?.price;
      if (manual != null) return { mark: manual, source: 'MANUAL' };
      const quoted = inputs.quotes
        .filter((q) => q.date === day)
        .map(quoteMark)
        .find((m) => m != null);
      return quoted ? { mark: quoted.toFixed(), source: 'QUOTE' } : current.option(contractId);
    },
    fx: current.fx,
  };
}

export interface ValuedPortfolio {
  ledgerCtx: LedgerContext;
  ledger: Ledger;
  valuation: PortfolioValuation;
  previous?: PortfolioValuation;
  priceOf(symbol: string): string | null;
  closeOn(symbol: string, date: IsoDate): string | null;
}

export async function valuePortfolio(
  ctx: Ctx,
  accountId?: Uuid,
  options: { previousClose?: boolean } = {},
): Promise<ValuedPortfolio> {
  const data = ctx.data;
  const ledgerCtx = await loadLedgerContext(data, accountId ? { accountId } : {});
  const ledger = replay(ledgerCtx.txns, ledgerCtx.opts);
  const [caches, registry] = await Promise.all([loadPriceCaches(data), loadRegistry(data)]);
  const now = new Date(ctx.clock.nowIso());
  const prices = priceLookup(caches, ledgerCtx, registry, now);
  const valuation = valueLedger(ledger, prices);
  const lookups = {
    priceOf: (symbol: string) =>
      prices.stock(symbol)?.price ?? valuation.stocks.find((s) => s.symbol === symbol)?.price ?? null,
    closeOn: (symbol: string, date: IsoDate) => lastClose(caches, symbol, date)?.close ?? null,
  };
  if (!options.previousClose) return { ledgerCtx, ledger, valuation, ...lookups };
  const previous = valueLedger(ledger, previousPriceLookup(caches, ledgerCtx, prices, registry, now));
  return { ledgerCtx, ledger, valuation, previous, ...lookups };
}

export interface DayChange {
  amount: string;
  percent: string | null;
}

function dayChange(value: string, before: string | undefined): DayChange {
  const was = dec(before ?? value);
  const amount = dec(value).minus(was);
  return { amount: amount.toFixed(), percent: was.isZero() ? null : amount.div(was.abs()).toFixed() };
}

export function positionDayChanges(valuation: PortfolioValuation, previous: PortfolioValuation) {
  const stocks = new Map(previous.stocks.map((s) => [s.symbol, s.marketValue]));
  const options = new Map(previous.options.map((o) => [o.contractId, o.marketValue]));
  return {
    stock: (symbol: string, value: string) => dayChange(value, stocks.get(symbol)),
    option: (contractId: string, value: string) => dayChange(value, options.get(contractId)),
  };
}
