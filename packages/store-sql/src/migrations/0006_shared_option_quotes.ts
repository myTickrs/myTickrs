import type { Kysely } from 'kysely';
import { columnNames, rebuildWithoutForeignKeys } from './rebuild.js';

// oxlint-disable-next-line typescript/no-explicit-any
type AnyDb = Kysely<any>;

const DAILY_COLUMNS = `"option_contract_id", "date", "bid", "ask", "last", "mark", "volume",
  "open_interest", "iv", "delta", "theta", "source"`;

const LATEST_COLUMNS = `"option_contract_id", "bid", "ask", "last", "mark", "iv", "delta",
  "gamma", "theta", "vega", "previous_close", "source", "as_of", "fetched_at"`;

export async function up(db: AnyDb): Promise<void> {
  const steps: string[] = [];

  if ((await columnNames(db, 'option_quote_daily')).includes('owner_id')) {
    steps.push(
      `CREATE TABLE "option_quote_daily_new" ("option_contract_id" text not null references "option_contracts" ("id"), "date" text not null, "bid" text, "ask" text, "last" text, "mark" text, "volume" text, "open_interest" text, "iv" text, "delta" text, "theta" text, "source" text not null, constraint "option_quote_daily_pk" primary key ("option_contract_id", "date"))`,
      `INSERT INTO "option_quote_daily_new" (${DAILY_COLUMNS})
         SELECT ${DAILY_COLUMNS} FROM (
           SELECT *, row_number() OVER (
             PARTITION BY "option_contract_id", "date"
             ORDER BY ("mark" IS NOT NULL) + ("last" IS NOT NULL) + ("bid" IS NOT NULL) + ("ask" IS NOT NULL) DESC,
                      "owner_id"
           ) AS "pick"
           FROM "option_quote_daily"
         )
         WHERE "pick" = 1`,
      `DROP TABLE "option_quote_daily"`,
      `ALTER TABLE "option_quote_daily_new" RENAME TO "option_quote_daily"`,
    );
  }

  if ((await columnNames(db, 'option_quote_latest')).includes('owner_id')) {
    steps.push(
      `CREATE TABLE "option_quote_latest_new" ("option_contract_id" text not null references "option_contracts" ("id"), "bid" text, "ask" text, "last" text, "mark" text, "iv" text, "delta" text, "gamma" text, "theta" text, "vega" text, "previous_close" text, "source" text not null, "as_of" text not null, "fetched_at" text not null, constraint "option_quote_latest_pk" primary key ("option_contract_id"))`,
      `INSERT INTO "option_quote_latest_new" (${LATEST_COLUMNS})
         SELECT ${LATEST_COLUMNS} FROM (
           SELECT *, row_number() OVER (
             PARTITION BY "option_contract_id"
             ORDER BY "as_of" DESC, "fetched_at" DESC, "owner_id"
           ) AS "pick"
           FROM "option_quote_latest"
         )
         WHERE "pick" = 1`,
      `DROP TABLE "option_quote_latest"`,
      `ALTER TABLE "option_quote_latest_new" RENAME TO "option_quote_latest"`,
    );
  }

  if (steps.length > 0) await rebuildWithoutForeignKeys(db, steps);
}

export async function down(): Promise<void> {}
