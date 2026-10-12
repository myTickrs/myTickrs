import type { SecurityType } from '@tickrs/shared';
import type { Uuid } from '@tickrs/server/model.js';
import { nowIso } from '@tickrs/server/ids.js';
import type { Executor } from './common.js';

export async function findSecurity(db: Executor, symbol: string) {
  return db.selectFrom('securities').selectAll().where('symbol', '=', symbol).executeTakeFirst();
}

export async function listSecurities(db: Executor, symbols: readonly string[]) {
  if (symbols.length === 0) return [];
  return db
    .selectFrom('securities')
    .selectAll()
    .where('symbol', 'in', [...symbols])
    .execute();
}

export async function ensureSecurity(
  db: Executor,
  symbol: string,
  defaults: { currency: string; name?: string; type?: SecurityType; exchange?: string | null },
) {
  const existing = await findSecurity(db, symbol);
  if (existing) return existing;
  const row = {
    symbol,
    exchange: defaults.exchange ?? null,
    name: defaults.name ?? symbol,
    currency: defaults.currency,
    type: defaults.type ?? ('STOCK' as SecurityType),
    sector: null,
    updatedAt: nowIso(),
  };
  await db
    .insertInto('securities')
    .values(row)
    .onConflict((oc) => oc.column('symbol').doNothing())
    .execute();
  return (await findSecurity(db, symbol))!;
}

export async function searchSecurities(db: Executor, userId: Uuid, query: string, limit = 20) {
  const like = `%${query.toUpperCase()}%`;
  return db
    .selectFrom('securities')
    .selectAll('securities')
    .where((eb) => eb.or([eb('symbol', 'like', like), eb('name', 'like', like)]))
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom('transactions')
          .innerJoin('accounts', 'accounts.id', 'transactions.accountId')
          .select('transactions.id')
          .whereRef('transactions.symbol', '=', 'securities.symbol')
          .where('accounts.userId', '=', userId),
      ),
    )
    .orderBy('symbol')
    .limit(limit)
    .execute();
}
