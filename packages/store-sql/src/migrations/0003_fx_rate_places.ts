import { Dec, toDecimalString } from '@tickrs/core';
import type { Kysely } from 'kysely';

// oxlint-disable-next-line typescript/no-explicit-any
type AnyDb = Kysely<any>;

const round = (rate: string) => toDecimalString(new Dec(rate).toDecimalPlaces(8, Dec.ROUND_HALF_UP));

export async function up(migrationDb: AnyDb): Promise<void> {
  const db = migrationDb.withoutPlugins();
  const rows: { base: string; quote: string; date: string; rate: string }[] = await db
    .selectFrom('fx_daily')
    .select(['base', 'quote', 'date', 'rate'])
    .execute();
  for (const r of rows) {
    const rate = round(r.rate);
    if (rate === r.rate) continue;
    await db
      .updateTable('fx_daily')
      .set({ rate })
      .where('base', '=', r.base)
      .where('quote', '=', r.quote)
      .where('date', '=', r.date)
      .execute();
  }
}

export async function down(): Promise<void> {}
