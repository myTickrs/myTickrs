import type { ProviderKeyRow } from '@tickrs/server/store/ports.js';

export type { ProviderKeyRow };
import type { ProviderKeyStatus } from '@tickrs/shared';
import type { Uuid } from '@tickrs/server/model.js';
import { nowIso } from '@tickrs/server/ids.js';
import type { Executor } from './common.js';

export async function listProviderKeys(db: Executor, userId: Uuid): Promise<ProviderKeyRow[]> {
  return db
    .selectFrom('userProviderKeys')
    .selectAll()
    .where('userId', '=', userId)
    .orderBy('provider')
    .orderBy('market')
    .execute();
}

export async function findProviderKey(db: Executor, userId: Uuid, provider: string, market: string) {
  return db
    .selectFrom('userProviderKeys')
    .selectAll()
    .where('userId', '=', userId)
    .where('provider', '=', provider)
    .where('market', '=', market)
    .executeTakeFirst();
}

export async function saveProviderKey(
  db: Executor,
  userId: Uuid,
  provider: string,
  market: string,
  key: { ciphertext: string; iv: string; authTag: string; hint: string },
): Promise<void> {
  const now = nowIso();
  await db
    .insertInto('userProviderKeys')
    .values({
      userId,
      provider,
      market,
      apiKeyCiphertext: key.ciphertext,
      apiKeyIv: key.iv,
      apiKeyAuthTag: key.authTag,
      keyHint: key.hint,
      status: 'UNTESTED',
      createdAt: now,
      updatedAt: now,
    })
    .onConflict((oc) =>
      oc.columns(['userId', 'provider', 'market']).doUpdateSet((eb) => ({
        apiKeyCiphertext: eb.ref('excluded.apiKeyCiphertext'),
        apiKeyIv: eb.ref('excluded.apiKeyIv'),
        apiKeyAuthTag: eb.ref('excluded.apiKeyAuthTag'),
        keyHint: eb.ref('excluded.keyHint'),
        status: 'UNTESTED',
        lastVerifiedAt: null,
        updatedAt: now,
      })),
    )
    .execute();
}

export async function setKeyStatus(
  db: Executor,
  userId: Uuid,
  provider: string,
  market: string,
  status: ProviderKeyStatus,
): Promise<void> {
  await db
    .updateTable('userProviderKeys')
    .set({ status, lastVerifiedAt: status === 'VALID' ? nowIso() : null, updatedAt: nowIso() })
    .where('userId', '=', userId)
    .where('provider', '=', provider)
    .where('market', '=', market)
    .execute();
}

export async function deleteProviderKey(
  db: Executor,
  userId: Uuid,
  provider: string,
  market: string,
): Promise<void> {
  await db
    .deleteFrom('userProviderKeys')
    .where('userId', '=', userId)
    .where('provider', '=', provider)
    .where('market', '=', market)
    .execute();
}

export async function deleteMarketKeys(db: Executor, userId: Uuid, market: string): Promise<void> {
  await db.deleteFrom('userProviderKeys').where('userId', '=', userId).where('market', '=', market).execute();
}
