import { Dec, toDecimalString } from './decimal.js';
import { LedgerError } from './errors.js';
import { nonNegative, positive } from './fields.js';
import type { ContractAdjustment, EffectiveContract, LedgerTxn, OptionContract } from './types.js';

export function effectiveContract(
  contract: OptionContract,
  adjustment?: ContractAdjustment | null,
): EffectiveContract {
  const a = adjustment ?? {};
  const multiplier = a.multiplier ?? contract.multiplier;
  const isAdjusted = Object.values(a).some((v) => v != null);
  return {
    ...contract,
    multiplier: toDecimalString(multiplier),
    strike: toDecimalString(a.strike ?? contract.strike),
    deliverableShares: toDecimalString(a.deliverableShares ?? multiplier),
    cashInLieu: toDecimalString(a.cashInLieu ?? '0'),
    quoteSymbol: a.quoteSymbol ?? null,
    displayName: a.displayName ?? null,
    isAdjusted,
    original: contract,
  };
}

export function contractMap(
  contracts: Iterable<OptionContract | EffectiveContract>,
): Map<string, EffectiveContract> {
  const map = new Map<string, EffectiveContract>();
  for (const c of contracts) map.set(c.id, 'original' in c ? c : effectiveContract(c));
  return map;
}

export const isCashSettled = (contract: Pick<OptionContract, 'settlement'>): boolean =>
  contract.settlement === 'CASH';

export function settlementCash(txn: LedgerTxn, contract: EffectiveContract): Dec {
  const settle = nonNegative(txn, 'price');
  const strike = new Dec(contract.strike);
  const diff = contract.right === 'CALL' ? settle.minus(strike) : strike.minus(settle);
  const cash = Dec.max(diff, 0).times(contract.multiplier).times(positive(txn, 'quantity'));
  return txn.type === 'ASN' ? cash.negated() : cash;
}

export function contractFor(
  txn: LedgerTxn,
  contracts: ReadonlyMap<string, EffectiveContract>,
): EffectiveContract {
  const id = txn.optionContractId;
  if (!id) throw new LedgerError('INVALID_TRANSACTION', txn.id, `${txn.type} requires an option contract`);
  const c = contracts.get(id);
  if (!c) throw new LedgerError('UNKNOWN_CONTRACT', txn.id, `Unknown option contract "${id}"`);
  return c;
}
