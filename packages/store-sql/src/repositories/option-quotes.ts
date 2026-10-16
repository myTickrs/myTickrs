import type { Insertable } from 'kysely';
import type {
  IsoDate,
  IsoTimestamp,
  OptionQuoteDailyTable,
  OptionQuoteLatestTable,
  Uuid,
} from '@tickrs/server/model.js';
import { nowIso } from '@tickrs/server/ids.js';
import type { Executor } from './common.js';
import { normalizeRow } from './common.js';

const QUOTE_DECIMALS = ['bid', 'ask', 'last', 'mark', 'volume', 'openInterest', 'iv', 'delta'] as const;

function contractsTradedBy(db: Executor, userId: Uuid) {
  return db
    .selectFrom('transactions')
    .innerJoin('accounts', 'accounts.id', 'transactions.accountId')
    .select('transactions.optionContractId')
    .where('accounts.userId', '=', userId)
    .where('transactions.optionContractId', 'is not', null)
    .$narrowType<{ optionContractId: Uuid }>();
}

export async function listLatestOptionQuotes(db: Executor, userId: Uuid) {
  const rows = await db
    .selectFrom('optionQuoteLatest')
    .selectAll()
    .where('optionContractId', 'in', contractsTradedBy(db, userId))
    .execute();
  return rows.map((r) => normalizeRow(r, ['bid', 'ask', 'last', 'mark', 'iv', 'delta', 'previousClose']));
}

export async function listDailyOptionQuotes(db: Executor, userId: Uuid) {
  const rows = await db
    .selectFrom('optionQuoteDaily')
    .selectAll()
    .where('optionContractId', 'in', contractsTradedBy(db, userId))
    .orderBy('date')
    .execute();
  return rows.map((r) => normalizeRow(r, QUOTE_DECIMALS));
}

export function listOptionQuoteTimes(db: Executor, contractIds: readonly Uuid[]) {
  if (contractIds.length === 0) return Promise.resolve([]);
  return db
    .selectFrom('optionQuoteLatest')
    .select(['optionContractId', 'fetchedAt'])
    .where('optionContractId', 'in', [...contractIds])
    .execute();
}

const LATEST_COLUMNS = [
  'bid',
  'ask',
  'last',
  'mark',
  'iv',
  'delta',
  'gamma',
  'theta',
  'vega',
  'previousClose',
  'source',
  'asOf',
] as const;

export async function upsertLatestOptionQuotes(
  db: Executor,
  rows: readonly Insertable<OptionQuoteLatestTable>[],
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insertInto('optionQuoteLatest')
    .values([...rows])
    .onConflict((oc) =>
      oc.columns(['optionContractId']).doUpdateSet((eb) => {
        const newer = eb('excluded.asOf', '>=', eb.ref('optionQuoteLatest.asOf'));
        const pick = (c: (typeof LATEST_COLUMNS)[number]) =>
          eb
            .case()
            .when(newer)
            .then(eb.ref(`excluded.${c}`))
            .else(eb.ref(`optionQuoteLatest.${c}`))
            .end();
        return {
          ...Object.fromEntries(LATEST_COLUMNS.map((c) => [c, pick(c)])),
          fetchedAt: eb.ref('excluded.fetchedAt'),
        };
      }),
    )
    .execute();
}

export async function upsertDailyOptionQuotes(
  db: Executor,
  rows: readonly Insertable<OptionQuoteDailyTable>[],
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insertInto('optionQuoteDaily')
    .values([...rows])
    .onConflict((oc) =>
      oc.columns(['optionContractId', 'date']).doUpdateSet((eb) => ({
        bid: eb.ref('excluded.bid'),
        ask: eb.ref('excluded.ask'),
        last: eb.ref('excluded.last'),
        mark: eb.ref('excluded.mark'),
        volume: eb.ref('excluded.volume'),
        openInterest: eb.ref('excluded.openInterest'),
        iv: eb.ref('excluded.iv'),
        delta: eb.ref('excluded.delta'),
        theta: eb.ref('excluded.theta'),
        source: eb.ref('excluded.source'),
      })),
    )
    .execute();
}

export async function addDailyOptionQuotes(
  db: Executor,
  rows: readonly Insertable<OptionQuoteDailyTable>[],
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insertInto('optionQuoteDaily')
    .values([...rows])
    .onConflict((oc) => oc.columns(['optionContractId', 'date']).doNothing())
    .execute();
}

export async function listManualMarks(db: Executor, userId: Uuid) {
  const rows = await db.selectFrom('manualOptionMarks').selectAll().where('userId', '=', userId).execute();
  return rows.map((r) => normalizeRow(r, ['mark']));
}

export async function upsertManualMark(
  db: Executor,
  input: { userId: Uuid; optionContractId: Uuid; mark: string; asOf: IsoDate },
): Promise<void> {
  const updatedAt: IsoTimestamp = nowIso();
  await db
    .insertInto('manualOptionMarks')
    .values({ ...input, updatedAt })
    .onConflict((oc) =>
      oc.columns(['userId', 'optionContractId']).doUpdateSet((eb) => ({
        mark: eb.ref('excluded.mark'),
        asOf: eb.ref('excluded.asOf'),
        updatedAt: eb.ref('excluded.updatedAt'),
      })),
    )
    .execute();
}

export async function deleteManualMark(db: Executor, userId: Uuid, optionContractId: Uuid): Promise<void> {
  await db
    .deleteFrom('manualOptionMarks')
    .where('userId', '=', userId)
    .where('optionContractId', '=', optionContractId)
    .execute();
}
