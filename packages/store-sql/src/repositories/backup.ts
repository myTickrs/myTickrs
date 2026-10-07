import type { Uuid } from '@tickrs/server/model.js';
import type { UserData } from '@tickrs/server/store/ports.js';
import type { Executor } from './common.js';
import { normalizeRow } from './common.js';
import { listAdjustments } from './option-contracts.js';
import { listUserTransactions } from './transactions.js';
import { requireUser, updateUserSettings } from './users.js';

const FEE_DECIMALS = [
  'stockPerOrder',
  'stockPerShare',
  'stockMinPerOrder',
  'stockMaxPerOrder',
  'stockMaxPctOfValue',
  'optionPerOrder',
  'optionPerContract',
  'optionMinPerOrder',
  'optionMaxPerOrder',
  'assignmentFee',
  'exerciseFee',
  'secFeeRate',
  'tafPerShare',
  'tafPerContract',
  'tafMaxPerTrade',
  'orfPerContract',
] as const;

const CHUNK = 500;

async function insertChunked<T>(rows: readonly T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
}

const withoutUser = <T extends { userId: Uuid }>({ userId: _userId, ...rest }: T) => rest;

export async function readUserData(db: Executor, userId: Uuid): Promise<UserData> {
  const [user, currencies, feeSchedules, accounts, strategyGroups, transactions, manualMarks, adjustments] =
    await Promise.all([
      requireUser(db, userId),
      db.selectFrom('currencies').selectAll().where('userId', '=', userId).orderBy('code').execute(),
      db.selectFrom('feeSchedules').selectAll().where('userId', '=', userId).orderBy('id').execute(),
      db.selectFrom('accounts').selectAll().where('userId', '=', userId).orderBy('id').execute(),
      db.selectFrom('strategyGroups').selectAll().where('userId', '=', userId).orderBy('id').execute(),
      listUserTransactions(db, userId),
      db
        .selectFrom('manualOptionMarks')
        .select(['optionContractId', 'mark', 'asOf', 'updatedAt'])
        .where('userId', '=', userId)
        .orderBy('optionContractId')
        .execute(),
      listAdjustments(db, userId),
    ]);
  return {
    settings: {
      baseCurrency: user.baseCurrency,
      averagePriceScope: user.averagePriceScope,
      optionPremiumTreatment: user.optionPremiumTreatment,
      autoExpireOtm: user.autoExpireOtm,
      shortBuyHandling: user.shortBuyHandling,
      borrowFeeTreatment: user.borrowFeeTreatment,
    },
    currencies: currencies.map(withoutUser),
    feeSchedules: feeSchedules.map((r) => withoutUser(normalizeRow(r, FEE_DECIMALS))),
    accounts: accounts.map(withoutUser),
    strategyGroups: strategyGroups.map(withoutUser),
    transactions,
    manualMarks: manualMarks.map((r) => normalizeRow(r, ['mark'])),
    contractAdjustments: adjustments.map(withoutUser),
  };
}

export async function replaceUserData(db: Executor, userId: Uuid, data: UserData): Promise<void> {
  const accountIds = db.selectFrom('accounts').select('id').where('userId', '=', userId);

  await db.deleteFrom('transactions').where('accountId', 'in', accountIds).execute();
  await db.deleteFrom('accounts').where('userId', '=', userId).execute();
  await db.deleteFrom('feeSchedules').where('userId', '=', userId).execute();
  await db.deleteFrom('strategyGroups').where('userId', '=', userId).execute();
  await db.deleteFrom('manualOptionMarks').where('userId', '=', userId).execute();
  await db.deleteFrom('optionContractAdjustments').where('userId', '=', userId).execute();
  await db.deleteFrom('currencies').where('userId', '=', userId).execute();

  const own = <T>(rows: readonly T[]) => rows.map((r) => ({ ...r, userId }));
  await insertChunked(own(data.currencies), (rows) => db.insertInto('currencies').values(rows).execute());
  await insertChunked(own(data.feeSchedules), (rows) => db.insertInto('feeSchedules').values(rows).execute());
  await insertChunked(own(data.accounts), (rows) => db.insertInto('accounts').values(rows).execute());
  await insertChunked(own(data.strategyGroups), (rows) =>
    db.insertInto('strategyGroups').values(rows).execute(),
  );
  await insertChunked(
    data.transactions.map((t) => ({ ...t, linkedTxnId: null })),
    (rows) => db.insertInto('transactions').values(rows).execute(),
  );
  for (const t of data.transactions) {
    if (t.linkedTxnId) {
      await db
        .updateTable('transactions')
        .set({ linkedTxnId: t.linkedTxnId })
        .where('id', '=', t.id)
        .execute();
    }
  }
  await insertChunked(own(data.manualMarks), (rows) =>
    db.insertInto('manualOptionMarks').values(rows).execute(),
  );
  await insertChunked(own(data.contractAdjustments), (rows) =>
    db.insertInto('optionContractAdjustments').values(rows).execute(),
  );
  await updateUserSettings(db, userId, data.settings);
}
