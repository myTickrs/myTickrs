import type { StoreTx } from '../store/ports.js';
import type { Ctx } from '../context.js';
import {
  addDays,
  dailySeries,
  dec,
  type DailyPriceSource,
  type IsoDate,
  type PerformancePoint,
  type PortfolioValuation,
  replay,
  resolveMark,
  type DatedPrice,
  type QuoteInput,
  valueLedger,
} from '@tickrs/core';
import type { Uuid } from '../model.js';
import { ensureHistory } from './market-data.js';
import { type LedgerContext, loadLedgerContext } from './ledger-context.js';

export const RANGES = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'ALL'] as const;
export type Range = (typeof RANGES)[number];

const todayIso = () => new Date().toISOString().slice(0, 10);

const HISTORY_LOOKBACK_DAYS = 7;

export function rangeStart(range: Range, firstDate: IsoDate, today = todayIso()): IsoDate {
  switch (range) {
    case '1W':
      return addDays(today, -7);
    case '1M':
      return addDays(today, -30);
    case '3M':
      return addDays(today, -91);
    case '6M':
      return addDays(today, -182);
    case 'YTD':
      return `${today.slice(0, 4)}-01-01`;
    case '1Y':
      return addDays(today, -365);
    case '3Y':
      return addDays(today, -1095);
    case '5Y':
      return addDays(today, -1826);
    case 'ALL':
      return firstDate;
  }
}

interface PriceHistory {
  closes: Map<string, { date: IsoDate; close: string }[]>;
  optionQuotes: Map<string, QuoteInput[]>;
  manualMarks: Map<string, DatedPrice[]>;
}

async function loadHistory(data: StoreTx, from: IsoDate): Promise<PriceHistory> {
  const [bars, quotes, marks] = await Promise.all([
    data.prices.dailyCloses(from),
    data.optionQuotes.daily(),
    data.optionQuotes.manualMarks(),
  ]);

  const closes = new Map<string, { date: IsoDate; close: string }[]>();
  for (const bar of bars) {
    const list = closes.get(bar.symbol) ?? [];
    list.push({ date: bar.date, close: bar.close });
    closes.set(bar.symbol, list);
  }
  const optionQuotes = new Map<string, QuoteInput[]>();
  for (const q of quotes) {
    const list = optionQuotes.get(q.optionContractId) ?? [];
    list.push({ date: q.date, mark: q.mark, bid: q.bid, ask: q.ask, last: q.last });
    optionQuotes.set(q.optionContractId, list);
  }
  return {
    closes,
    optionQuotes,
    manualMarks: new Map(marks.map((m) => [m.optionContractId, [{ date: m.asOf, price: m.mark }]])),
  };
}

function closeOn(history: PriceHistory, symbol: string, date: IsoDate): string | null {
  let found: string | null = null;
  for (const bar of history.closes.get(symbol) ?? []) {
    if (bar.date > date) break;
    found = bar.close;
  }
  return found;
}

function buildDailyPrices(ledgerCtx: LedgerContext, history: PriceHistory, today: IsoDate): DailyPriceSource {
  const tradesByContract = new Map<string, DatedPrice[]>();
  for (const row of ledgerCtx.rows) {
    if (row.assetClass !== 'OPTION' || !row.optionContractId || row.price == null) continue;
    if (!['BTO', 'STO', 'BTC', 'STC'].includes(row.type)) continue;
    const list = tradesByContract.get(row.optionContractId) ?? [];
    list.push({ date: row.tradeDate, price: row.price });
    tradesByContract.set(row.optionContractId, list);
  }
  const lastTradePrice = new Map<string, { date: IsoDate; price: string }>();
  for (const row of ledgerCtx.rows) {
    if (row.assetClass !== 'STOCK' || !row.symbol || row.price == null) continue;
    lastTradePrice.set(row.symbol, { date: row.tradeDate, price: row.price });
  }

  return {
    stockClose: (symbol, date) => {
      const close = closeOn(history, symbol, date);
      if (close) return { price: close, estimated: false };
      const trade = lastTradePrice.get(symbol);
      return trade && trade.date <= date ? { price: trade.price, estimated: true } : null;
    },
    optionMark: (contractId, date) => {
      const contract = ledgerCtx.contracts.get(contractId);
      if (!contract) return null;
      const resolved = resolveMark(date, {
        contract,
        quotes: history.optionQuotes.get(contractId) ?? [],
        manualMarks: history.manualMarks.get(contractId) ?? [],
        trades: tradesByContract.get(contractId) ?? [],
        underlyingClose: (d) => closeOn(history, contract.underlying, d),
      });
      return { mark: resolved.mark, estimated: resolved.isEstimated, source: resolved.source };
    },
    fx: (currency) => {
      const rate = ledgerCtx.fx(currency, ledgerCtx.user.baseCurrency, today);
      return rate ? { rate, estimated: false } : null;
    },
  };
}

export async function valueAtClose(
  ctx: Ctx,
  ledgerCtx: LedgerContext,
  date: IsoDate,
): Promise<PortfolioValuation | null> {
  const txns = ledgerCtx.txns.filter((t) => t.tradeDate <= date);
  if (txns.length === 0) return null;
  const ledger = replay(txns, ledgerCtx.opts);

  const historyFrom = addDays(date, -HISTORY_LOOKBACK_DAYS);
  const symbols = ledgerCtx.rows
    .filter((r) => r.tradeDate <= date)
    .map((r) => r.symbol)
    .filter((s): s is string => s != null);
  await ensureHistory(ctx, symbols, historyFrom, date);
  const prices = buildDailyPrices(ledgerCtx, await loadHistory(ctx.data, historyFrom), ctx.clock.today());
  return valueLedger(ledger, {
    stock: (symbol) => prices.stockClose(symbol, date),
    option: (contractId) => prices.optionMark(contractId, date, ledger),
    fx: (currency) => prices.fx?.(currency) ?? null,
  });
}

export interface PerformanceResponse {
  baseCurrency: string;
  range: Range;
  from: IsoDate;
  to: IsoDate;
  points: PerformancePoint[];
  benchmark: { symbol: string; points: { date: IsoDate; return: string }[] } | null;
  pendingSymbols: string[];
  cached: boolean;
}

async function accountSeries(
  ctx: Ctx,
  accountId: Uuid,
  range: Range,
): Promise<{
  points: PerformancePoint[];
  pendingSymbols: string[];
  from: IsoDate;
  to: IsoDate;
  cached: boolean;
}> {
  const data = ctx.data;
  const ledgerCtx = await loadLedgerContext(data, { accountId });
  const today = ctx.clock.today();
  const first = ledgerCtx.rows[0]?.tradeDate;
  if (!first) return { points: [], pendingSymbols: [], from: today, to: today, cached: false };

  const from = rangeStart(range, first, today);
  const seriesFrom = from < first ? first : from;

  const historyFrom = addDays(seriesFrom, -HISTORY_LOOKBACK_DAYS);

  const symbols = [...new Set(ledgerCtx.rows.map((r) => r.symbol).filter((s): s is string => s != null))];
  const history = await ensureHistory(ctx, symbols, historyFrom, today);

  const cachedRows = await data.snapshots.listFrom(accountId, seriesFrom);
  const expectedDays = Math.max(0, Math.round((Date.parse(today) - Date.parse(seriesFrom)) / 86_400_000));
  const cacheComplete = cachedRows.length >= expectedDays && cachedRows.length > 0;

  const prices = buildDailyPrices(ledgerCtx, await loadHistory(data, historyFrom), today);
  const points = dailySeries(ledgerCtx.txns, ledgerCtx.opts, prices, { from: seriesFrom, to: today });

  const settled = points.filter((p) => p.date < today);
  if (settled.length > 0) {
    await data.snapshots.upsert(
      settled.map((p) => ({
        accountId,
        date: p.date,
        positionsValue: p.positionsValue,
        marketValue: p.marketValue,
        netContributions: p.netContributions,
        twrIndex: p.twrIndex,
        isEstimated: p.estimated ? (1 as const) : (0 as const),
      })),
    );
  }

  return {
    points,
    pendingSymbols: history.pendingSymbols,
    from: seriesFrom,
    to: today,
    cached: cacheComplete,
  };
}

export async function getPerformance(
  ctx: Ctx,
  options: { accountId?: Uuid; range?: Range; benchmark?: string } = {},
): Promise<PerformanceResponse> {
  const data = ctx.data;
  const range = options.range ?? '1Y';
  const ledgerCtx = await loadLedgerContext(data);
  const accountIds = options.accountId ? [options.accountId] : await data.accounts.ids();

  const series = await Promise.all(accountIds.map((id) => accountSeries(ctx, id, range)));
  const merged = mergePoints(series.map((s) => s.points));
  const pendingSymbols = [...new Set(series.flatMap((s) => s.pendingSymbols))];
  const from = series.map((s) => s.from).toSorted()[0] ?? ctx.clock.today();

  return {
    baseCurrency: ledgerCtx.user.baseCurrency,
    range,
    from,
    to: ctx.clock.today(),
    points: merged,
    benchmark: options.benchmark
      ? await benchmarkSeries(ctx, options.benchmark, from, ctx.clock.today())
      : null,
    pendingSymbols,
    cached: series.every((s) => s.cached),
  };
}

function mergePoints(seriesList: PerformancePoint[][]): PerformancePoint[] {
  const lists = seriesList.filter((s) => s.length > 0);
  if (lists.length <= 1) return lists[0] ?? [];

  const byDate = new Map<IsoDate, PerformancePoint>();
  for (const series of lists) {
    for (const point of series) {
      const existing = byDate.get(point.date);
      if (!existing) {
        byDate.set(point.date, { ...point });
        continue;
      }
      byDate.set(point.date, {
        ...existing,
        positionsValue: dec(existing.positionsValue).plus(point.positionsValue).toFixed(),
        marketValue: dec(existing.marketValue).plus(point.marketValue).toFixed(),
        netContributions: dec(existing.netContributions).plus(point.netContributions).toFixed(),
        externalFlow: dec(existing.externalFlow).plus(point.externalFlow).toFixed(),
        estimated: existing.estimated || point.estimated,
        dailyReturn: null,
        undefinedReturn: existing.undefinedReturn || point.undefinedReturn,
        twrIndex: '1',
      });
    }
  }

  const points = [...byDate.values()].toSorted((a, b) => (a.date < b.date ? -1 : 1));
  let previous: string | null = null;
  let index = dec('1');
  return points.map((p) => {
    const denominator = dec(previous ?? '0').plus(p.externalFlow);
    const defined = denominator.gt(0);
    const r = defined ? dec(p.marketValue).div(denominator).minus(1) : null;
    if (r) index = index.times(r.plus(1));
    previous = p.marketValue;
    return {
      ...p,
      dailyReturn: r ? r.toFixed() : null,
      twrIndex: index.toFixed(),
      undefinedReturn: !defined,
    };
  });
}

async function benchmarkSeries(ctx: Ctx, symbol: string, from: IsoDate, to: IsoDate) {
  const data = ctx.data;
  await ensureHistory(ctx, [symbol], from, to);
  const bars = await data.prices.symbolCloses(symbol, from);
  const startBar = bars[0];
  if (!startBar) return { symbol, points: [] };
  const start = dec(startBar.close);
  return {
    symbol,
    points: bars.map((b) => ({ date: b.date, return: dec(b.close).div(start).minus(1).toFixed() })),
  };
}
