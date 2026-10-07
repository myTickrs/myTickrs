import type { Uuid } from '@tickrs/server/model.js';
import { nowIso } from '@tickrs/server/ids.js';
import type { Executor } from './common.js';

export async function findImportMapping(db: Executor, userId: Uuid, fingerprint: string) {
  const row = await db
    .selectFrom('importMappings')
    .select('mapping')
    .where('userId', '=', userId)
    .where('fingerprint', '=', fingerprint)
    .executeTakeFirst();
  return row?.mapping;
}

export async function saveImportMapping(
  db: Executor,
  userId: Uuid,
  fingerprint: string,
  format: string,
  mapping: string,
): Promise<void> {
  const now = nowIso();
  await db
    .insertInto('importMappings')
    .values({ userId, fingerprint, format, mapping, createdAt: now, updatedAt: now })
    .onConflict((oc) =>
      oc.columns(['userId', 'fingerprint']).doUpdateSet({ format, mapping, updatedAt: now }),
    )
    .execute();
}
