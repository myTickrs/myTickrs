import type { TxnRow, NewTxnRow } from '@tickrs/server/store/ports.js';

export type { TxnRow, NewTxnRow };
import type { TransactionQuery } from '@tickrs/shared';
import type { Updateable } from 'kysely';
import type { Database, TransactionsTable, Uuid } from '@tickrs/server/model.js';
import type { Executor } from './common.js';
import { normalizeRow } from './common.js';

const DECIMAL_FIELDS = [
  'quantity',
  'price',
  'fee',
  'amount',
  'splitFrom',
  'splitTo',
  'feeCommission',
  'feeRegulatory',
  'realizedBefore',
] as const satisfies readonly (keyof TxnRow)[];

const clean = (row: TxnRow): TxnRow => normalizeRow(row, DECIMAL_FIELDS);

function ordered<T>(qb: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow generic keeps call sites tidy
  return (qb as any).orderBy('tradeDate').orderBy('createdAt').orderBy('id');
}

export async function listAccountTransactions(db: Executor, accountId: Uuid): Promise<TxnRow[]> {
  const rows = await ordered(
    db.selectFrom('transactions').selectAll().where('accountId', '=', accountId),
  ).execute();
  return rows.map(clean);
}

export async function listUserTransactions(db: Executor, userId: Uuid): Promise<TxnRow[]> {
  const rows = await ordered(
    db
      .selectFrom('transactions')
      .innerJoin('accounts', 'accounts.id', 'transactions.accountId')
      .selectAll('transactions')
      .where('accounts.userId', '=', userId),
  ).execute();
  return rows.map(clean);
}

export async function findTransaction(db: Executor, userId: Uuid, id: Uuid): Promise<TxnRow | undefined> {
  const row = await db
    .selectFrom('transactions')
    .innerJoin('accounts', 'accounts.id', 'transactions.accountId')
    .selectAll('transactions')
    .where('transactions.id', '=', id)
    .where('accounts.userId', '=', userId)
    .executeTakeFirst();
  return row ? clean(row) : undefined;
}

export async function findLinked(db: Executor, userId: Uuid, txnId: Uuid): Promise<TxnRow | undefined> {
  const row = await db
    .selectFrom('transactions')
    .innerJoin('accounts', 'accounts.id', 'transactions.accountId')
    .selectAll('transactions')
    .where('transactions.linkedTxnId', '=', txnId)
    .where('accounts.userId', '=', userId)
    .executeTakeFirst();
  return row ? clean(row) : undefined;
}

export async function queryTransactions(db: Executor, userId: Uuid, q: TransactionQuery) {
  let query = db
    .selectFrom('transactions')
    .innerJoin('accounts', 'accounts.id', 'transactions.accountId')
    .where('accounts.userId', '=', userId);
  if (q.accountId) query = query.where('transactions.accountId', '=', q.accountId);
  if (q.assetClass) query = query.where('transactions.assetClass', '=', q.assetClass);
  if (q.symbol) query = query.where('transactions.symbol', '=', q.symbol);
  if (q.type) query = query.where('transactions.type', 'in', q.type.split(',') as TxnRow['type'][]);
  if (q.from) query = query.where('transactions.tradeDate', '>=', q.from);
  if (q.to) query = query.where('transactions.tradeDate', '<=', q.to);

  const { count } = await query
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();

  let sorted = query.selectAll('transactions').orderBy(`transactions.${q.sort}`, q.direction);
  if (q.sort !== 'tradeDate') sorted = sorted.orderBy('transactions.tradeDate', 'desc');
  const rows = await sorted
    .orderBy('transactions.createdAt', q.direction)
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize)
    .execute();

  return { rows: rows.map(clean), total: Number(count) };
}

export async function insertTransactions(db: Executor, rows: NewTxnRow[]): Promise<void> {
  if (rows.length > 0) await db.insertInto('transactions').values(rows).execute();
}

export async function updateTransaction(db: Executor, id: Uuid, patch: Updateable<TransactionsTable>) {
  await db.updateTable('transactions').set(patch).where('id', '=', id).execute();
}

export async function deleteTransactions(db: Executor, ids: readonly Uuid[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .deleteFrom('transactions')
    .where('id', 'in', [...ids])
    .execute();
}

export async function referencedContractIds(db: Executor, userId: Uuid, accountId?: Uuid): Promise<Uuid[]> {
  let query = db
    .selectFrom('transactions')
    .innerJoin('accounts', 'accounts.id', 'transactions.accountId')
    .select('transactions.optionContractId')
    .distinct()
    .where('accounts.userId', '=', userId)
    .where('transactions.optionContractId', 'is not', null);
  if (accountId) query = query.where('transactions.accountId', '=', accountId);
  const rows = await query.execute();
  return rows.map((r) => r.optionContractId!).filter(Boolean);
}

export type { Database };

export function listLifecycleEvents(db: Executor, userId: Uuid, optionContractId: Uuid) {
  return db
    .selectFrom('transactions')
    .innerJoin('accounts', 'accounts.id', 'transactions.accountId')
    .select(['transactions.id', 'transactions.accountId'])
    .where('accounts.userId', '=', userId)
    .where('transactions.optionContractId', '=', optionContractId)
    .where('transactions.type', 'in', ['ASN', 'EXR'])
    .execute();
}
