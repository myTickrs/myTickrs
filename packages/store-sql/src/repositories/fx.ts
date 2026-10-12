import { toFxRateString } from '@tickrs/core';
import type { FxRow } from '@tickrs/server/store/ports.js';

export type { FxRow };
import type { Executor } from './common.js';
import { normalizeRow } from './common.js';

export async function listFxRates(db: Executor): Promise<FxRow[]> {
  const rows = await db.selectFrom('fxDaily').selectAll().orderBy('date').execute();
  return rows.map((r) => normalizeRow(r, ['rate']));
}

export async function upsertFxRates(db: Executor, rows: readonly FxRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insertInto('fxDaily')
    .values(rows.map((r) => ({ ...r, rate: toFxRateString(r.rate) })))
    .onConflict((oc) =>
      oc.columns(['base', 'quote', 'date']).doUpdateSet((eb) => ({
        rate: eb.ref('excluded.rate'),
        source: eb.ref('excluded.source'),
      })),
    )
    .execute();
}

export function fxCoverage(db: Executor, base: string, quote: string) {
  return db
    .selectFrom('fxDaily')
    .select(({ fn }) => [fn.min('date').as('first'), fn.max('date').as('last')])
    .where('base', '=', base)
    .where('quote', '=', quote)
    .executeTakeFirst();
}
