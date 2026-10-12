import type { FeeScheduleRow } from '@tickrs/server/store/ports.js';

export type { FeeScheduleRow };
import type { FeeSchedule } from '@tickrs/core';
import type { FeeScheduleInput } from '@tickrs/shared';
import type { Uuid } from '@tickrs/server/model.js';
import { newId, nowIso } from '@tickrs/server/ids.js';
import type { Executor } from './common.js';
import { normalizeRow } from './common.js';

const FIELDS = [
  'stockPerOrder',
  'stockPerShare',
  'stockMinPerOrder',
  'stockMaxPerOrder',
  'stockMaxPctOfValue',
  'optionPerOrder',
  'optionPerContract',
  'optionMinPerOrder',
  'optionMaxPerOrder',
  'assignmentFee',
  'exerciseFee',
  'secFeeRate',
  'tafPerShare',
  'tafPerContract',
  'tafMaxPerTrade',
  'orfPerContract',
] as const satisfies readonly (keyof FeeSchedule & keyof FeeScheduleRow)[];

export function toFeeSchedule(row: FeeScheduleRow | null | undefined): FeeSchedule {
  if (!row) return {};
  return Object.fromEntries(FIELDS.map((f) => [f, row[f]]).filter(([, v]) => v != null)) as FeeSchedule;
}

export async function findFeeSchedule(db: Executor, userId: Uuid, id: Uuid | null) {
  if (!id) return undefined;
  const row = await db
    .selectFrom('feeSchedules')
    .selectAll()
    .where('id', '=', id)
    .where('userId', '=', userId)
    .executeTakeFirst();
  return row ? normalizeRow(row, FIELDS) : undefined;
}

export async function saveAccountFeeSchedule(
  db: Executor,
  userId: Uuid,
  accountId: Uuid,
  input: FeeScheduleInput,
) {
  const account = await db
    .selectFrom('accounts')
    .select(['id', 'feeScheduleId'])
    .where('id', '=', accountId)
    .where('userId', '=', userId)
    .executeTakeFirstOrThrow();

  const values = {
    name: input.name,
    presetKey: input.presetKey ?? null,
    ...Object.fromEntries(FIELDS.map((f) => [f, input[f] ?? null])),
    updatedAt: nowIso(),
  };

  if (account.feeScheduleId) {
    await db.updateTable('feeSchedules').set(values).where('id', '=', account.feeScheduleId).execute();
    return findFeeSchedule(db, userId, account.feeScheduleId);
  }
  const id = newId();
  await db
    .insertInto('feeSchedules')
    .values({ id, userId, ...values, createdAt: nowIso() })
    .execute();
  await db
    .updateTable('accounts')
    .set({ feeScheduleId: id, updatedAt: nowIso() })
    .where('id', '=', accountId)
    .execute();
  return findFeeSchedule(db, userId, id);
}
