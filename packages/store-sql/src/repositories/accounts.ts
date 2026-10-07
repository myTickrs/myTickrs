import type { AccountRow } from '@tickrs/server/store/ports.js';

export type { AccountRow };
import type { AccountInput } from '@tickrs/shared';
import type { Uuid } from '@tickrs/server/model.js';
import { AppError } from '@tickrs/server/errors.js';
import { newId, nowIso } from '@tickrs/server/ids.js';
import type { Executor } from './common.js';

export async function listAccounts(db: Executor, userId: Uuid) {
  return db.selectFrom('accounts').selectAll().where('userId', '=', userId).orderBy('name').execute();
}

export async function findAccount(db: Executor, userId: Uuid, id: Uuid) {
  return db
    .selectFrom('accounts')
    .selectAll()
    .where('id', '=', id)
    .where('userId', '=', userId)
    .executeTakeFirst();
}

export async function requireAccount(db: Executor, userId: Uuid, id: Uuid, lock = false) {
  void lock;
  const account = await db
    .selectFrom('accounts')
    .selectAll()
    .where('id', '=', id)
    .where('userId', '=', userId)
    .executeTakeFirst();
  if (!account) throw new AppError('NOT_FOUND', 404, 'No such account');
  return account;
}

export async function createAccount(db: Executor, userId: Uuid, input: AccountInput) {
  const now = nowIso();
  const row = {
    id: newId(),
    userId,
    name: input.name,
    broker: input.broker ?? null,
    currency: input.currency,
    feeScheduleId: input.feeScheduleId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insertInto('accounts').values(row).execute();
  return row;
}

export async function updateAccount(db: Executor, userId: Uuid, id: Uuid, input: Partial<AccountInput>) {
  await requireAccount(db, userId, id);
  await db
    .updateTable('accounts')
    .set({
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.broker === undefined ? {} : { broker: input.broker }),
      ...(input.currency === undefined ? {} : { currency: input.currency }),
      ...(input.feeScheduleId === undefined ? {} : { feeScheduleId: input.feeScheduleId }),
      updatedAt: nowIso(),
    })
    .where('id', '=', id)
    .execute();
  return requireAccount(db, userId, id);
}

export async function deleteAccount(db: Executor, userId: Uuid, id: Uuid) {
  await requireAccount(db, userId, id);
  await db.deleteFrom('accounts').where('id', '=', id).execute();
}

export async function accountIdsOf(db: Executor, userId: Uuid): Promise<Uuid[]> {
  const rows = await db.selectFrom('accounts').select('id').where('userId', '=', userId).execute();
  return rows.map((r) => r.id);
}
