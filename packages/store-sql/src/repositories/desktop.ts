import type { Uuid } from '@tickrs/server/model.js';
import type { SyncBase } from '@tickrs/server/store/ports.js';
import type { Executor } from './common.js';

export async function findSyncBase(db: Executor, userId: Uuid): Promise<SyncBase | null> {
  const row = await db
    .selectFrom('syncBase')
    .select(['cloudUrl', 'account', 'localFingerprint', 'cloudFingerprint', 'syncedAt'])
    .where('userId', '=', userId)
    .executeTakeFirst();
  return row ?? null;
}

export async function saveSyncBase(db: Executor, userId: Uuid, base: SyncBase | null): Promise<void> {
  if (!base) {
    await db.deleteFrom('syncBase').where('userId', '=', userId).execute();
    return;
  }
  await db
    .insertInto('syncBase')
    .values({ userId, ...base })
    .onConflict((oc) => oc.column('userId').doUpdateSet(base))
    .execute();
}
