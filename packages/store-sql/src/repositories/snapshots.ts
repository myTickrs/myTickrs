import type { Insertable } from 'kysely';
import type { IsoDate, PortfolioSnapshotsTable, Uuid } from '@tickrs/server/model.js';
import type { Executor } from './common.js';
import { normalizeRow } from './common.js';

export async function invalidateSnapshotsFrom(db: Executor, accountId: Uuid, date: IsoDate): Promise<void> {
  await db
    .deleteFrom('portfolioSnapshots')
    .where('accountId', '=', accountId)
    .where('date', '>=', date)
    .execute();
}

export async function invalidateUserSnapshots(db: Executor, userId: Uuid): Promise<void> {
  await db
    .deleteFrom('portfolioSnapshots')
    .where('accountId', 'in', (eb) => eb.selectFrom('accounts').select('id').where('userId', '=', userId))
    .execute();
}

export async function invalidateAllSnapshots(db: Executor, accountId: Uuid): Promise<void> {
  await db.deleteFrom('portfolioSnapshots').where('accountId', '=', accountId).execute();
}

const SNAPSHOT_DECIMALS = ['positionsValue', 'marketValue', 'netContributions', 'twrIndex'] as const;

export async function listSnapshotsFrom(db: Executor, accountId: Uuid, from: IsoDate) {
  const rows = await db
    .selectFrom('portfolioSnapshots')
    .selectAll()
    .where('accountId', '=', accountId)
    .where('date', '>=', from)
    .orderBy('date')
    .execute();
  return rows.map((r) => normalizeRow(r, SNAPSHOT_DECIMALS));
}

export async function upsertSnapshots(
  db: Executor,
  rows: readonly Insertable<PortfolioSnapshotsTable>[],
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insertInto('portfolioSnapshots')
    .values([...rows])
    .onConflict((oc) =>
      oc.columns(['accountId', 'date']).doUpdateSet((eb) => ({
        positionsValue: eb.ref('excluded.positionsValue'),
        marketValue: eb.ref('excluded.marketValue'),
        netContributions: eb.ref('excluded.netContributions'),
        twrIndex: eb.ref('excluded.twrIndex'),
        isEstimated: eb.ref('excluded.isEstimated'),
      })),
    )
    .execute();
}
