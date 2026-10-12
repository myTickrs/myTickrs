import { eachDay } from './dates.js';
import { Dec, dec } from './decimal.js';
import { Ledger } from './ledger.js';
import { orderLedger } from './ordering.js';
import type { IsoDate, LedgerOptions, LedgerTxn } from './types.js';
import { type FxQuote, type OptionMark, type StockPrice, valueLedger } from './valuation.js';

export interface DailyPriceSource {
  stockClose(symbol: string, date: IsoDate): StockPrice | null;
  optionMark(contractId: string, date: IsoDate, ledger: Ledger): OptionMark | null;
  fx?(currency: string): FxQuote | null;
}

export interface PerformancePoint {
  date: IsoDate;
  positionsValue: string;
  marketValue: string;
  netContributions: string;
  externalFlow: string;
  dailyReturn: string | null;
  twrIndex: string;
  estimated: boolean;
  undefinedReturn: boolean;
}

export function dailySeries(
  txns: readonly LedgerTxn[],
  opts: LedgerOptions,
  prices: DailyPriceSource,
  range: { from?: IsoDate; to: IsoDate },
): PerformancePoint[] {
  const ordered = orderLedger(txns);
  const first = ordered[0];
  if (!first || first.tradeDate > range.to) return [];

  const ledger = new Ledger(opts);
  const points: PerformancePoint[] = [];
  const from = range.from && range.from > first.tradeDate ? range.from : first.tradeDate;
  let i = 0;
  let prevValue: Dec | null = null;
  let index = new Dec(1);
  let prevContributions = new Dec(0);

  for (const day of eachDay(first.tradeDate, range.to)) {
    while (i < ordered.length && ordered[i]!.tradeDate === day) {
      ledger.apply(ordered[i]!);
      i++;
    }
    ledger.settlePending();

    const v = valueLedger(ledger, {
      stock: (symbol) => prices.stockClose(symbol, day),
      option: (contractId) => prices.optionMark(contractId, day, ledger),
      fx: (currency) => prices.fx?.(currency) ?? null,
    });
    const contributions = dec(v.netContributions);
    const flow = contributions.minus(prevContributions);
    prevContributions = contributions;
    const value = dec(v.marketValue);
    const denominator = (prevValue ?? new Dec(0)).plus(flow);
    const defined = denominator.gt(0);
    const r = defined ? value.div(denominator).minus(1) : null;

    if (day >= from) {
      if (day === from) index = new Dec(1);
      if (r) index = index.times(r.plus(1));
      points.push({
        date: day,
        positionsValue: v.positionsValue,
        marketValue: v.marketValue,
        netContributions: v.netContributions,
        externalFlow: flow.toFixed(),
        dailyReturn: r ? r.toFixed() : null,
        twrIndex: index.toFixed(),
        estimated: v.hasEstimatedValues,
        undefinedReturn: !defined && !(prevValue === null && flow.isZero() && value.isZero()),
      });
    }
    prevValue = value;
  }
  return points;
}

export function twr(points: readonly PerformancePoint[]): Dec {
  const last = points.at(-1);
  return last ? dec(last.twrIndex).minus(1) : new Dec(0);
}
