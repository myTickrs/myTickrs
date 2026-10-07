import type { CurrencyRow } from '@tickrs/server/store/ports.js';

export type { CurrencyRow };
import type { Uuid } from '@tickrs/server/model.js';
import { nowIso } from '@tickrs/server/ids.js';
import type { Executor } from './common.js';

export function listCurrencies(db: Executor, userId: Uuid): Promise<CurrencyRow[]> {
  return db.selectFrom('currencies').selectAll().where('userId', '=', userId).orderBy('code').execute();
}

export async function addCurrencies(
  db: Executor,
  userId: Uuid,
  rows: readonly { code: string; name: string }[],
): Promise<void> {
  if (rows.length === 0) return;
  const createdAt = nowIso();
  await db
    .insertInto('currencies')
    .values(rows.map((r) => ({ userId, code: r.code, name: r.name, createdAt })))
    .onConflict((oc) => oc.columns(['userId', 'code']).doNothing())
    .execute();
}

export async function deleteCurrency(db: Executor, userId: Uuid, code: string): Promise<void> {
  await db.deleteFrom('currencies').where('userId', '=', userId).where('code', '=', code).execute();
}

export async function currencyUsage(
  db: Executor,
  userId: Uuid,
): Promise<{ code: string; accounts: number; transactions: number }[]> {
  const [accounts, transactions] = await Promise.all([
    db
      .selectFrom('accounts')
      .select(({ fn }) => ['currency', fn.countAll<number>().as('count')])
      .where('userId', '=', userId)
      .groupBy('currency')
      .execute(),
    db
      .selectFrom('transactions')
      .innerJoin('accounts', 'accounts.id', 'transactions.accountId')
      .select(({ fn }) => ['transactions.currency', fn.countAll<number>().as('count')])
      .where('accounts.userId', '=', userId)
      .groupBy('transactions.currency')
      .execute(),
  ]);
  const byCode = new Map<string, { code: string; accounts: number; transactions: number }>();
  const entry = (code: string) => {
    const found = byCode.get(code) ?? { code, accounts: 0, transactions: 0 };
    byCode.set(code, found);
    return found;
  };
  for (const a of accounts) entry(a.currency).accounts = Number(a.count);
  for (const t of transactions) entry(t.currency).transactions = Number(t.count);
  return [...byCode.values()].toSorted((a, b) => (a.code < b.code ? -1 : 1));
}
