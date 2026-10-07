import type { Insertable } from 'kysely';
import type { IsoDate, PriceDailyTable, PriceLatestTable, Uuid } from '@tickrs/server/model.js';
import type { Executor } from './common.js';
import { normalizeRow } from './common.js';

export type NewDailyPrice = Insertable<PriceDailyTable>;
export type NewLatestPrice = Insertable<PriceLatestTable>;

function tradedBy(db: Executor, userId: Uuid) {
  return db
    .selectFrom('transactions')
    .innerJoin('accounts', 'accounts.id', 'transactions.accountId')
    .select('transactions.symbol')
    .where('accounts.userId', '=', userId)
    .where('transactions.symbol', 'is not', null)
    .$narrowType<{ symbol: string }>();
}

export async function listLatestPrices(db: Executor, userId: Uuid) {
  const rows = await db
    .selectFrom('priceLatest')
    .selectAll()
    .where('symbol', 'in', tradedBy(db, userId))
    .execute();
  return rows.map((r) =>
    normalizeRow(r, ['price', 'change', 'changePct', 'open', 'high', 'low', 'previousClose']),
  );
}

export function listQuoteTimes(db: Executor, symbols: readonly string[]) {
  return db
    .selectFrom('priceLatest')
    .select(['symbol', 'fetchedAt'])
    .where('symbol', 'in', [...symbols])
    .execute();
}

export async function listDailyCloses(db: Executor, userId: Uuid, from?: IsoDate) {
  let query = db
    .selectFrom('priceDaily')
    .select(['symbol', 'date', 'close'])
    .where('symbol', 'in', tradedBy(db, userId));
  if (from) query = query.where('date', '>=', from);
  const rows = await query.orderBy('date').execute();
  return rows.map((r) => normalizeRow(r, ['close']));
}

export async function listSymbolCloses(db: Executor, symbol: string, from: IsoDate) {
  const rows = await db
    .selectFrom('priceDaily')
    .select(['date', 'close'])
    .where('symbol', '=', symbol)
    .where('date', '>=', from)
    .orderBy('date')
    .execute();
  return rows.map((r) => normalizeRow(r, ['close']));
}

export async function listSymbolBars(db: Executor, symbol: string, from: IsoDate) {
  const rows = await db
    .selectFrom('priceDaily')
    .select(['date', 'open', 'high', 'low', 'close'])
    .where('symbol', '=', symbol)
    .where('date', '>=', from)
    .orderBy('date')
    .execute();
  return rows.map((r) => normalizeRow(r, ['open', 'high', 'low', 'close']));
}

export function priceCoverage(db: Executor, symbols: readonly string[]) {
  return db
    .selectFrom('priceDaily')
    .select(({ fn }) => ['symbol', fn.min('date').as('first'), fn.max('date').as('last')])
    .where('symbol', 'in', [...symbols])
    .groupBy('symbol')
    .execute();
}

const QUOTE_COLUMNS = [
  'price',
  'change',
  'changePct',
  'open',
  'high',
  'low',
  'previousClose',
  'source',
  'asOf',
] as const;

export async function upsertLatestPrices(db: Executor, rows: readonly NewLatestPrice[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insertInto('priceLatest')
    .values([...rows])
    .onConflict((oc) =>
      oc.column('symbol').doUpdateSet((eb) => {
        const newer = eb('excluded.asOf', '>=', eb.ref('priceLatest.asOf'));
        const pick = (c: (typeof QUOTE_COLUMNS)[number]) =>
          eb
            .case()
            .when(newer)
            .then(eb.ref(`excluded.${c}`))
            .else(eb.ref(`priceLatest.${c}`))
            .end();
        return {
          ...Object.fromEntries(QUOTE_COLUMNS.map((c) => [c, pick(c)])),
          fetchedAt: eb.ref('excluded.fetchedAt'),
        };
      }),
    )
    .execute();
}

export async function upsertDailyPrices(db: Executor, rows: readonly NewDailyPrice[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insertInto('priceDaily')
    .values([...rows])
    .onConflict((oc) =>
      oc.columns(['symbol', 'date']).doUpdateSet((eb) => ({
        open: eb.ref('excluded.open'),
        high: eb.ref('excluded.high'),
        low: eb.ref('excluded.low'),
        close: eb.ref('excluded.close'),
        volume: eb.ref('excluded.volume'),
        source: eb.ref('excluded.source'),
      })),
    )
    .execute();
}
