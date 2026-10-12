import { type Dec, dec, isDecimalString } from './decimal.js';
import { LedgerError } from './errors.js';
import type { LedgerTxn } from './types.js';

type DecimalField = 'quantity' | 'price' | 'fee' | 'amount' | 'splitFrom' | 'splitTo';

export function required(txn: LedgerTxn, field: DecimalField): Dec {
  const v = txn[field];
  if (v == null || !isDecimalString(v)) {
    throw new LedgerError('INVALID_TRANSACTION', txn.id, `${txn.type} requires a decimal "${field}"`);
  }
  return dec(v);
}

export function optional(txn: LedgerTxn, field: DecimalField): Dec {
  const v = txn[field];
  if (v == null || v === '') return dec('0');
  if (!isDecimalString(v)) {
    throw new LedgerError('INVALID_TRANSACTION', txn.id, `"${field}" is not a decimal: "${v}"`);
  }
  return dec(v);
}

export function positive(txn: LedgerTxn, field: DecimalField): Dec {
  const v = required(txn, field);
  if (!v.isPositive() || v.isZero()) {
    throw new LedgerError('INVALID_TRANSACTION', txn.id, `${txn.type} requires "${field}" > 0`);
  }
  return v;
}

export function nonNegative(txn: LedgerTxn, field: DecimalField): Dec {
  const v = required(txn, field);
  if (v.isNegative() && !v.isZero()) {
    throw new LedgerError('INVALID_TRANSACTION', txn.id, `${txn.type} requires "${field}" ≥ 0`);
  }
  return v;
}

export function feeOf(txn: LedgerTxn): Dec {
  const fee = optional(txn, 'fee');
  if (fee.isNegative() && !fee.isZero()) {
    throw new LedgerError('INVALID_TRANSACTION', txn.id, 'fee must be ≥ 0');
  }
  return fee;
}
