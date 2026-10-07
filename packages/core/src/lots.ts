import { Dec } from './decimal.js';
import type { IsoDate, PositionSide } from './types.js';

export interface Lot {
  txnId: string;
  openDate: IsoDate;
  side: PositionSide;
  qty: Dec;
  amount: Dec;
  rawAmount: Dec;
}

export interface ClosedPortion {
  lot: Lot;
  qty: Dec;
  amount: Dec;
  rawAmount: Dec;
}

export function openQty(lots: readonly Lot[]): Dec {
  return lots.reduce((acc, l) => acc.plus(l.qty), new Dec(0));
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
  return { taken, remaining };
}

export function scaleLots(lots: readonly Lot[], ratio: Dec): Lot[] {
  return lots.map((l) => ({ ...l, qty: l.qty.times(ratio) }));
}

export function sumTaken(taken: readonly ClosedPortion[]): Dec {
  return taken.reduce((acc, x) => acc.plus(x.amount), new Dec(0));
}
