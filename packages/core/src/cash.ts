import { contractFor, isCashSettled, settlementCash } from './contracts.js';
import type { Dec } from './decimal.js';
import { feeOf, nonNegative, optional, positive } from './fields.js';
import type { EffectiveContract, LedgerTxn } from './types.js';

export function cashEffect(txn: LedgerTxn, contracts?: ReadonlyMap<string, EffectiveContract>): Dec {
  const fee = feeOf(txn);
  switch (txn.type) {
    case 'BUY': {
      const gross = positive(txn, 'quantity').times(nonNegative(txn, 'price'));
      return gross.plus(fee).negated().plus(optional(txn, 'amount'));
    }
    case 'SELL': {
      const gross = positive(txn, 'quantity').times(nonNegative(txn, 'price'));
      return gross.minus(fee).minus(optional(txn, 'amount'));
    }
    case 'SELL_SHORT':
      return positive(txn, 'quantity').times(nonNegative(txn, 'price')).minus(fee);
    case 'BUY_TO_COVER':
      return positive(txn, 'quantity').times(nonNegative(txn, 'price')).plus(fee).negated();
    case 'DIV_CASH':
      return positive(txn, 'amount').minus(fee);
    case 'DIV_PAID':
    case 'BORROW_FEE':
      return positive(txn, 'amount').plus(fee).negated();
    case 'DIV_REINVEST':
    case 'SPLIT':
    case 'EXP':
      return fee.negated();
    case 'ASN':
    case 'EXR': {
      const c = txn.optionContractId ? contracts?.get(txn.optionContractId) : undefined;
      return c && isCashSettled(c) ? settlementCash(txn, c).minus(fee) : fee.negated();
    }

    case 'BTO':
    case 'BTC': {
      const c = contractFor(txn, contracts ?? new Map());
      const premium = positive(txn, 'quantity').times(nonNegative(txn, 'price')).times(c.multiplier);
      return premium.plus(fee).negated();
    }
    case 'STO':
    case 'STC': {
      const c = contractFor(txn, contracts ?? new Map());
      const premium = positive(txn, 'quantity').times(nonNegative(txn, 'price')).times(c.multiplier);
      return premium.minus(fee);
    }
  }
}

export const currencyOf = (t: LedgerTxn, fallback = 'USD'): string => t.currency ?? fallback;
