import type { Uuid } from '@tickrs/server/model.js';
import type { Executor } from './common.js';

import { availableThisMinute, isKeyless, PROVIDER_LIMITS, spendTokens } from '@tickrs/market-data';

const today = () => new Date().toISOString().slice(0, 10);

export async function usageToday(
  db: Executor,
  userId: Uuid,
  provider: string,
  market: string,
): Promise<number> {
  const row = await db
    .selectFrom('providerUsage')
    .select('requestCount')
    .where('userId', '=', userId)
    .where('provider', '=', provider)
    .where('market', '=', market)
    .where('date', '=', today())
    .executeTakeFirst();
  return row?.requestCount ?? 0;
}

export async function recordUsage(
  db: Executor,
  userId: Uuid,
  provider: string,
  market: string,
  count = 1,
): Promise<void> {
  if (count <= 0) return;
  spendTokens(userId, provider, market, count);
  if (isKeyless(provider)) return;
  await db
    .insertInto('providerUsage')
    .values({ userId, provider, market, date: today(), requestCount: count })
    .onConflict((oc) =>
      oc.columns(['userId', 'provider', 'market', 'date']).doUpdateSet((eb) => ({
        requestCount: eb('providerUsage.requestCount', '+', count),
      })),
    )
    .execute();
}

export async function remainingBudget(
  db: Executor,
  userId: Uuid,
  provider: string,
  market: string,
): Promise<number> {
  const perMinute = availableThisMinute(userId, provider, market);
  const perDay = PROVIDER_LIMITS[provider]?.perDay;
  if (!perDay) return perMinute;
  const used = await usageToday(db, userId, provider, market);
  return Math.max(0, Math.min(perMinute, perDay - used));
}

export async function hasDailyHeadroom(
  db: Executor,
  userId: Uuid,
  provider: string,
  market: string,
): Promise<boolean> {
  const perDay = PROVIDER_LIMITS[provider]?.perDay;
  if (!perDay) return true;
  return (await usageToday(db, userId, provider, market)) < perDay * 0.9;
}
