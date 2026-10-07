import type { StoreTx } from '../store/ports.js';
import { cashEffect, type EffectiveContract, type LedgerOptions, type LedgerTxn } from '@tickrs/core';
import type { Uuid } from '../model.js';
import { buildFxResolver, type FxResolver } from './fx-resolver.js';
import type { TxnRow, UserRow } from '../store/ports.js';

export type { UserRow };

export function rowToLedgerTxn(row: TxnRow): LedgerTxn {
  return {
    id: row.id,
    assetClass: row.assetClass,
    type: row.type,
    tradeDate: row.tradeDate,
    symbol: row.symbol,
    optionContractId: row.optionContractId,
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    amount: row.amount,
    splitFrom: row.splitFrom,
    splitTo: row.splitTo,
    realizedBefore: row.realizedBefore,
    linkedTxnId: row.linkedTxnId,
    isSystemGenerated: row.isSystemGenerated === 1,
    currency: row.currency,
  };
}

export interface LedgerContext {
  user: UserRow;
  rows: TxnRow[];
  txns: LedgerTxn[];
  contracts: Map<string, EffectiveContract>;
  fx: FxResolver;
  opts: LedgerOptions;
}

export async function loadLedgerContext(
  data: StoreTx,
  options: { accountId?: Uuid; user?: UserRow } = {},
): Promise<LedgerContext> {
  const user = options.user ?? (await data.users.require());
  const [rows, contractIds, fxRows] = await Promise.all([
    options.accountId ? data.transactions.listForAccount(options.accountId) : data.transactions.listForUser(),
    data.transactions.referencedContractIds(options.accountId),
    data.fx.listRates(),
  ]);
  const contracts = await data.contracts.effective(contractIds);
  const fx = buildFxResolver(fxRows);
  return {
    user,
    rows,
    txns: rows.map((r) => rowToLedgerTxn(r)),
    contracts,
    fx,
    opts: {
      baseCurrency: user.baseCurrency,
      averagePriceScope: user.averagePriceScope,
      premiumTreatment: user.optionPremiumTreatment,
      borrowFeeTreatment: user.borrowFeeTreatment,
      acrossAccounts: !options.accountId,
      contracts,
    },
  };
}

export function toTransactionDto(row: TxnRow, contracts: ReadonlyMap<string, EffectiveContract>) {
  const contract = row.optionContractId ? contracts.get(row.optionContractId) : undefined;
  let cash: string | null = null;
  try {
    cash = cashEffect(rowToLedgerTxn(row), contracts).toFixed();
  } catch {
    cash = null;
  }
  return {
    id: row.id,
    accountId: row.accountId,
    assetClass: row.assetClass,
    type: row.type,
    tradeDate: row.tradeDate,
    symbol: row.symbol,
    currency: row.currency,
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    feeSource: row.feeSource,
    feeCommission: row.feeCommission,
    feeRegulatory: row.feeRegulatory,
    realizedBefore: row.realizedBefore,
    amount: row.amount,
    splitFrom: row.splitFrom,
    splitTo: row.splitTo,
    linkedTxnId: row.linkedTxnId,
    isSystemGenerated: row.isSystemGenerated === 1,
    strategyGroupId: row.strategyGroupId,
    notes: row.notes,
    cashEffect: cash,
    optionContract: contract
      ? {
          id: contract.id,
          underlying: contract.underlying,
          expiration: contract.expiration,
          strike: contract.strike,
          issuedStrike: contract.original.strike,
          right: contract.right,
          multiplier: contract.multiplier,
          deliverableShares: contract.deliverableShares,
          isAdjusted: contract.isAdjusted,
        }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type TransactionDto = ReturnType<typeof toTransactionDto>;
