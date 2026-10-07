import type { MarketId } from '@tickrs/shared';
import type { MarketProviderAssociation } from '@tickrs/server/store/ports.js';
import type { Uuid } from '@tickrs/server/model.js';
import { nowIso } from '@tickrs/server/ids.js';
import type { Executor } from './common.js';

export async function listMarketProviders(db: Executor, userId: Uuid): Promise<MarketProviderAssociation[]> {
  const rows = await db
    .selectFrom('userMarketProviders')
    .select(['market', 'provider', 'priority', 'enabled'])
    .where('userId', '=', userId)
    .orderBy('market')
    .orderBy('priority')
    .orderBy('provider')
    .execute();
  return rows.map((r) => ({ ...r, enabled: r.enabled === 1 }));
}

export async function replaceMarketProviders(
  db: Executor,
  userId: Uuid,
  market: MarketId,
  rows: Omit<MarketProviderAssociation, 'market'>[],
): Promise<void> {
  await resetMarketProviders(db, userId, market);
  if (rows.length === 0) return;
  const now = nowIso();
  await db
    .insertInto('userMarketProviders')
    .values(
      rows.map((r) => ({
        userId,
        market,
        provider: r.provider,
        priority: r.priority,
        enabled: r.enabled ? (1 as const) : (0 as const),
        createdAt: now,
        updatedAt: now,
      })),
    )
    .execute();
}

export async function resetMarketProviders(db: Executor, userId: Uuid, market: MarketId): Promise<void> {
  await db
    .deleteFrom('userMarketProviders')
    .where('userId', '=', userId)
    .where('market', '=', market)
    .execute();
}
