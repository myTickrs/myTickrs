import type { MarketRow } from '@tickrs/server/store/ports.js';

export type { MarketRow };
import type { Uuid } from '@tickrs/server/model.js';
import { nowIso } from '@tickrs/server/ids.js';
import type { Executor } from './common.js';

export function listMarkets(db: Executor, userId: Uuid): Promise<MarketRow[]> {
  return db
    .selectFrom('markets')
    .selectAll()
    .where('userId', '=', userId)
    .orderBy('position')
    .orderBy('code')
    .execute();
}

export async function saveMarket(
  db: Executor,
  userId: Uuid,
  row: Omit<MarketRow, 'userId' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const now = nowIso();
  const { code: _code, ...rest } = row;
  await db
    .insertInto('markets')
    .values({ ...row, userId, createdAt: now, updatedAt: now })
    .onConflict((oc) => oc.columns(['userId', 'code']).doUpdateSet({ ...rest, updatedAt: now }))
    .execute();
}

export async function deleteMarket(db: Executor, userId: Uuid, code: string): Promise<void> {
  await db.deleteFrom('markets').where('userId', '=', userId).where('code', '=', code).execute();
}
