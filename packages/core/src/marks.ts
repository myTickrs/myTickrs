import { type Dec, dec, type DecimalInput } from './decimal.js';
import { intrinsicValue } from './options.js';
import type { EffectiveContract, IsoDate } from './types.js';

export interface QuoteInput {
  date: IsoDate;
  mark?: string | null;
  bid?: string | null;
  ask?: string | null;
  last?: string | null;
}

export interface DatedPrice {
  date: IsoDate;
  price: string;
}

export type MarkSource = 'QUOTE' | 'MANUAL' | 'TRADE' | 'INTRINSIC_FLOOR' | 'INTRINSIC' | 'NONE';

export interface ResolvedMark {
  mark: string;
  source: MarkSource;
  isEstimated: boolean;
  asOf: IsoDate | null;
}

export interface MarkInputs {
  contract: Pick<EffectiveContract, 'right' | 'strike' | 'expiration'>;
  quotes: readonly QuoteInput[];
  manualMarks: readonly DatedPrice[];
  trades: readonly DatedPrice[];
  underlyingClose: (date: IsoDate) => DecimalInput | null;
}

export function quoteMark(q: QuoteInput): Dec | null {
  if (q.mark != null) return dec(q.mark);
  if (q.bid != null && q.ask != null) return dec(q.bid).plus(dec(q.ask)).div(2);
  if (q.last != null) return dec(q.last);
  return null;
}

const PRIORITY: Record<'MANUAL' | 'QUOTE' | 'TRADE', number> = { MANUAL: 3, QUOTE: 2, TRADE: 1 };

export function resolveMark(date: IsoDate, inputs: MarkInputs): ResolvedMark {
  const { contract } = inputs;
  const intrinsicOn = (d: IsoDate): Dec | null => {
    const s = inputs.underlyingClose(d);
    return s == null ? null : intrinsicValue(contract.right, contract.strike, s);
  };

  if (date >= contract.expiration) {
    const iv = intrinsicOn(contract.expiration);
    if (iv) return { mark: iv.toFixed(), source: 'INTRINSIC', isEstimated: false, asOf: contract.expiration };
  }

  const todays = inputs.quotes
    .filter((q) => q.date === date)
    .map(quoteMark)
    .find((m) => m != null);
  if (todays && date < contract.expiration) {
    return { mark: todays.toFixed(), source: 'QUOTE', isEstimated: false, asOf: date };
  }

  let best: { value: Dec; source: 'MANUAL' | 'QUOTE' | 'TRADE'; date: IsoDate } | null = null;
  const consider = (value: Dec | null, source: 'MANUAL' | 'QUOTE' | 'TRADE', d: IsoDate) => {
    if (value == null || d > date) return;
    if (!best || d > best.date || (d === best.date && PRIORITY[source] > PRIORITY[best.source])) {
      best = { value, source, date: d };
    }
  };
  for (const q of inputs.quotes) consider(quoteMark(q), 'QUOTE', q.date);
  for (const m of inputs.manualMarks) consider(dec(m.price), 'MANUAL', m.date);
  for (const t of inputs.trades) consider(dec(t.price), 'TRADE', t.date);

  const iv = intrinsicOn(date);
  const chosen = best as { value: Dec; source: 'MANUAL' | 'QUOTE' | 'TRADE'; date: IsoDate } | null;
  if (!chosen) {
    return iv
      ? { mark: iv.toFixed(), source: 'INTRINSIC', isEstimated: true, asOf: date }
      : { mark: '0', source: 'NONE', isEstimated: true, asOf: null };
  }
  if (iv && iv.gt(chosen.value)) {
    return { mark: iv.toFixed(), source: 'INTRINSIC_FLOOR', isEstimated: true, asOf: date };
  }
  return { mark: chosen.value.toFixed(), source: chosen.source, isEstimated: true, asOf: chosen.date };
}
