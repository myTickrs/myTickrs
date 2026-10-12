import { Dec } from './decimal.js';
import type { IsoDate, PositionSide } from './types.js';

export interface Lot {
  readonly txnId: string;
  readonly openDate: IsoDate;
  readonly side: PositionSide;
  readonly qty: Dec;
  readonly amount: Dec;
  readonly rawAmount: Dec;
}

export interface ClosedPortion {
  lot: Lot;
  qty: Dec;
  amount: Dec;
  rawAmount: Dec;
}

const openQtyCache = new WeakMap<readonly Lot[], { count: number; qty: Dec }>();

export function openQty(lots: readonly Lot[]): Dec {
  const cached = openQtyCache.get(lots);
  if (cached?.count === lots.length) return cached.qty;
  const from = cached && cached.count < lots.length ? cached.count : 0;
  let qty = from > 0 ? cached!.qty : new Dec(0);
  for (let i = from; i < lots.length; i++) qty = qty.plus(lots[i]!.qty);
  openQtyCache.set(lots, { count: lots.length, qty });
  return qty;
}

export function totalAmount(lots: readonly Lot[], field: 'amount' | 'rawAmount' = 'amount'): Dec {
  return lots.reduce((acc, l) => acc.plus(l[field]), new Dec(0));
}

export function takeFifo(lots: readonly Lot[], qty: Dec): { taken: ClosedPortion[]; remaining: Lot[] } {
  let left = qty;
  const taken: ClosedPortion[] = [];
  const remaining: Lot[] = [];
  for (const lot of lots) {
    if (left.isZero()) {
      remaining.push(lot);
      continue;
    }
    if (lot.qty.lte(left)) {
      taken.push({
        lot,
        qty: lot.qty,
        amount: lot.amount,
        rawAmount: lot.rawAmount,
      });
      left = left.minus(lot.qty);
    } else {
      const share = left.div(lot.qty);
      const amount = lot.amount.times(share);
      const rawAmount = lot.rawAmount.times(share);
      taken.push({ lot, qty: left, amount, rawAmount });
      remaining.push({
        ...lot,
        qty: lot.qty.minus(left),
        amount: lot.amount.minus(amount),
        rawAmount: lot.rawAmount.minus(rawAmount),
      });
      left = new Dec(0);
    }
  }
  if (!left.isZero()) throw new RangeError('takeFifo: insufficient quantity');
  openQtyCache.set(remaining, { count: remaining.length, qty: openQty(lots).minus(qty) });
  return { taken, remaining };
}

export function scaleLots(lots: readonly Lot[], ratio: Dec): Lot[] {
  const scaled = lots.map((l) => ({ ...l, qty: l.qty.times(ratio) }));
  openQtyCache.set(scaled, { count: scaled.length, qty: openQty(lots).times(ratio) });
  return scaled;
}

export function sumTaken(taken: readonly ClosedPortion[]): Dec {
  return taken.reduce((acc, x) => acc.plus(x.amount), new Dec(0));
}
