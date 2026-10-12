import type { TransactionType } from '@tickrs/shared';
import { Dec, dec } from './decimal.js';
import type { DecimalString } from './types.js';

export interface FeeSchedule {
  stockPerOrder?: DecimalString | null;
  stockPerShare?: DecimalString | null;
  stockMinPerOrder?: DecimalString | null;
  stockMaxPerOrder?: DecimalString | null;
  stockMaxPctOfValue?: DecimalString | null;

  optionPerOrder?: DecimalString | null;
  optionPerContract?: DecimalString | null;
  optionMinPerOrder?: DecimalString | null;
  optionMaxPerOrder?: DecimalString | null;

  assignmentFee?: DecimalString | null;
  exerciseFee?: DecimalString | null;

  secFeeRate?: DecimalString | null;
  tafPerShare?: DecimalString | null;
  tafPerContract?: DecimalString | null;
  tafMaxPerTrade?: DecimalString | null;
  orfPerContract?: DecimalString | null;
}

export interface FeeInput {
  type: TransactionType;
  quantity: DecimalString;
  price: DecimalString;
  multiplier?: DecimalString;
  usListing?: boolean;
}

export interface FeeBreakdown {
  commission: string;
  secFee: string;
  taf: string;
  orf: string;
  total: string;
}

export type FeePresetKey = 'ZERO' | 'OPTIONS_PER_CONTRACT' | 'PER_SHARE' | 'CUSTOM';

export const FEE_PRESETS: Record<FeePresetKey, { name: string; schedule: FeeSchedule }> = {
  ZERO: { name: 'Zero commission', schedule: {} },
  OPTIONS_PER_CONTRACT: {
    name: 'Zero-commission stocks, $0.65 per option contract',
    schedule: { optionPerContract: '0.65' },
  },
  PER_SHARE: {
    name: 'Per share: $0.005/share, $1.00 minimum, 1% maximum',
    schedule: {
      stockPerShare: '0.005',
      stockMinPerOrder: '1',
      stockMaxPctOfValue: '0.01',
      optionPerContract: '0.65',
      optionMinPerOrder: '1',
    },
  },
  CUSTOM: { name: 'Custom', schedule: {} },
};

const ZERO = new Dec(0);
const val = (v: DecimalString | null | undefined): Dec | null => (v == null || v === '' ? null : dec(v));
const or0 = (v: DecimalString | null | undefined): Dec => val(v) ?? ZERO;

const cents = (d: Dec) => d.toDecimalPlaces(2, Dec.ROUND_HALF_UP);
const centsUp = (d: Dec) => d.toDecimalPlaces(2, Dec.ROUND_UP);

function commission(
  perOrder: Dec,
  perUnit: Dec,
  units: Dec,
  min: Dec | null,
  max: Dec | null,
  maxPct: Dec | null,
  tradeValue: Dec,
): Dec {
  let c = perOrder.plus(perUnit.times(units));
  if (c.isZero()) return ZERO;
  if (min) c = Dec.max(c, min);
  if (maxPct) c = Dec.min(c, maxPct.times(tradeValue));
  if (max) c = Dec.min(c, max);
  return cents(c);
}

function breakdown(c: Dec, sec: Dec, taf: Dec, orf: Dec): FeeBreakdown {
  return {
    commission: c.toFixed(2),
    secFee: sec.toFixed(2),
    taf: taf.toFixed(2),
    orf: orf.toFixed(2),
    total: c.plus(sec).plus(taf).plus(orf).toFixed(2),
  };
}

export function calculateFee(schedule: FeeSchedule, input: FeeInput): FeeBreakdown {
  const s: FeeSchedule =
    input.usListing === false
      ? { ...schedule, secFeeRate: null, tafPerShare: null, tafPerContract: null, orfPerContract: null }
      : schedule;
  switch (input.type) {
    case 'BUY':
    case 'SELL':
    case 'SELL_SHORT':
    case 'BUY_TO_COVER': {
      const q = dec(input.quantity);
      const value = q.times(dec(input.price));
      const c = commission(
        or0(s.stockPerOrder),
        or0(s.stockPerShare),
        q,
        val(s.stockMinPerOrder),
        val(s.stockMaxPerOrder),
        val(s.stockMaxPctOfValue),
        value,
      );
      if (input.type === 'BUY' || input.type === 'BUY_TO_COVER') return breakdown(c, ZERO, ZERO, ZERO);
      const sec = centsUp(value.times(or0(s.secFeeRate)));
      const tafRaw = q.times(or0(s.tafPerShare));
      const taf = centsUp(val(s.tafMaxPerTrade) ? Dec.min(tafRaw, val(s.tafMaxPerTrade)!) : tafRaw);
      return breakdown(c, sec, taf, ZERO);
    }
    case 'BTO':
    case 'STO':
    case 'BTC':
    case 'STC': {
      const q = dec(input.quantity);
      const value = q.times(dec(input.price)).times(dec(input.multiplier ?? '100'));
      const c = commission(
        or0(s.optionPerOrder),
        or0(s.optionPerContract),
        q,
        val(s.optionMinPerOrder),
        val(s.optionMaxPerOrder),
        null,
        value,
      );
      const orf = centsUp(q.times(or0(s.orfPerContract)));
      const isSale = input.type === 'STO' || input.type === 'STC';
      if (!isSale) return breakdown(c, ZERO, ZERO, orf);
      const sec = centsUp(value.times(or0(s.secFeeRate)));
      const tafRaw = q.times(or0(s.tafPerContract));
      const taf = centsUp(val(s.tafMaxPerTrade) ? Dec.min(tafRaw, val(s.tafMaxPerTrade)!) : tafRaw);
      return breakdown(c, sec, taf, orf);
    }
    case 'ASN':
      return breakdown(cents(or0(s.assignmentFee)), ZERO, ZERO, ZERO);
    case 'EXR':
      return breakdown(cents(or0(s.exerciseFee)), ZERO, ZERO, ZERO);
    default:
      return breakdown(ZERO, ZERO, ZERO, ZERO);
  }
}
