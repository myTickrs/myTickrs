export type LedgerErrorCode =
  | 'INSUFFICIENT_POSITION'
  | 'OPPOSITE_POSITION_OPEN'
  | 'INVALID_TRANSACTION'
  | 'UNKNOWN_CONTRACT'
  | 'CURRENCY_MISMATCH';

export class LedgerError extends Error {
  override name = 'LedgerError';

  constructor(
    readonly code: LedgerErrorCode,
    readonly txnId: string,
    message: string,
  ) {
    super(message);
  }
}
