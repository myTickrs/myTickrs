import type { StrategyGroupKind, StrategyTag } from '@tickrs/shared';
import type { Uuid } from '@tickrs/server/model.js';
import { newId, nowIso } from '@tickrs/server/ids.js';
import type { StrategyGroupRow } from '@tickrs/server/store/ports.js';
import type { Executor } from './common.js';

export type { StrategyGroupRow };

export async function createStrategyGroup(
  db: Executor,
  userId: Uuid,
  input: { kind: StrategyGroupKind; name?: string | null; strategyTag?: StrategyTag | null },
): Promise<StrategyGroupRow> {
  const now = nowIso();
  const row = {
    id: newId(),
    userId,
    kind: input.kind,
    strategyTag: input.strategyTag ?? null,
    name: input.name ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insertInto('strategyGroups').values(row).execute();
  return row;
}

export function findStrategyGroup(db: Executor, userId: Uuid, id: Uuid) {
  return db
    .selectFrom('strategyGroups')
    .selectAll()
    .where('id', '=', id)
    .where('userId', '=', userId)
    .executeTakeFirst();
}
