import type { Kysely } from 'kysely';
import { columnNames, rebuildWithoutForeignKeys, tableSql } from './rebuild.js';

// oxlint-disable-next-line typescript/no-explicit-any
type AnyDb = Kysely<any>;

const SECURITIES = `CREATE TABLE "securities_new" ("symbol" text primary key, "exchange" text, "name" text not null, "currency" text default 'USD' not null, "type" text not null, "sector" text, "updated_at" text not null, constraint "securities_type_ck" check ("type" in ('STOCK', 'ETF', 'INDEX')))`;

const TRANSACTIONS = `CREATE TABLE "transactions_new" ("id" text primary key, "account_id" text not null references "accounts" ("id") on delete cascade, "asset_class" text not null, "symbol" text not null references "securities" ("symbol"), "option_contract_id" text references "option_contracts" ("id"), "type" text not null, "trade_date" text not null, "quantity" text, "price" text, "fee" text default '0' not null, "amount" text, "split_from" text, "split_to" text, "currency" text default 'USD' not null, "linked_txn_id" text references "transactions" ("id"), "is_system_generated" integer default 0 not null, "is_auto_expired" integer default 0 not null, "strategy_group_id" text references "strategy_groups" ("id") on delete set null, "fee_source" text default 'MANUAL' not null, "fee_commission" text, "fee_regulatory" text, "realized_before" text, "strategy_tag" text, "notes" text, "created_at" text not null, "updated_at" text not null, constraint "transactions_asset_class_ck" check ("asset_class" in ('STOCK', 'OPTION')), constraint "transactions_type_matches_class_ck" check ((asset_class = 'STOCK' and "type" in ('BUY', 'SELL', 'DIV_CASH', 'DIV_REINVEST', 'SPLIT', 'SELL_SHORT', 'BUY_TO_COVER', 'DIV_PAID', 'BORROW_FEE')) or (asset_class = 'OPTION' and "type" in ('BTO', 'STO', 'BTC', 'STC', 'EXP', 'ASN', 'EXR'))), constraint "transactions_option_contract_ck" check ((asset_class = 'OPTION') = (option_contract_id is not null)), constraint "transactions_system_generated_ck" check ("is_system_generated" in (0, 1)), constraint "transactions_auto_expired_ck" check ("is_auto_expired" in (0, 1)), constraint "transactions_fee_source_ck" check ("fee_source" in ('AUTO', 'MANUAL', 'IMPORTED')), constraint "transactions_strategy_tag_ck" check (strategy_tag is null or "strategy_tag" in ('COVERED_CALL', 'CSP', 'WHEEL', 'VERTICAL', 'IRON_CONDOR', 'STRADDLE', 'STRANGLE', 'CALENDAR', 'LONG_CALL', 'LONG_PUT', 'OTHER')))`;

const TRANSACTION_COLUMNS = `"id", "account_id", "asset_class", "symbol", "option_contract_id", "type",
  "trade_date", "quantity", "price", "fee", "amount", "split_from", "split_to", "currency", "linked_txn_id",
  "is_system_generated", "is_auto_expired", "strategy_group_id", "fee_source", "fee_commission",
  "fee_regulatory", "realized_before", "strategy_tag", "notes", "created_at", "updated_at"`;

export async function up(db: AnyDb): Promise<void> {
  const steps: string[] = [];

  if ((await columnNames(db, 'option_contracts')).includes('occ_symbol')) {
    steps.push(
      `ALTER TABLE "option_contracts" RENAME COLUMN "occ_symbol" TO "contract_key"`,
      `UPDATE "option_contracts"
          SET "contract_key" = upper(trim("underlying_symbol")) || '|' || "expiration" || '|'
                               || (CASE "option_right" WHEN 'CALL' THEN 'C' ELSE 'P' END) || '|' || "strike"`,
    );
  }

  if (!(await tableSql(db, 'securities')).includes(`'INDEX'`)) {
    steps.push(
      SECURITIES,
      `INSERT INTO "securities_new" ("symbol", "exchange", "name", "currency", "type", "sector", "updated_at")
         SELECT "symbol", "exchange", "name", "currency", "type", "sector", "updated_at" FROM "securities"`,
      `DROP TABLE "securities"`,
      `ALTER TABLE "securities_new" RENAME TO "securities"`,
    );
  }

  if (!(await columnNames(db, 'transactions')).includes('realized_before')) {
    steps.push(
      TRANSACTIONS,
      `INSERT INTO "transactions_new" (${TRANSACTION_COLUMNS})
         SELECT ${TRANSACTION_COLUMNS.replace('"realized_before"', 'NULL')} FROM "transactions"`,
      `DROP TABLE "transactions"`,
      `ALTER TABLE "transactions_new" RENAME TO "transactions"`,
      `CREATE INDEX "transactions_account_contract_date_idx" on "transactions" ("account_id", "option_contract_id", "trade_date")`,
      `CREATE INDEX "transactions_account_symbol_date_idx" on "transactions" ("account_id", "symbol", "trade_date")`,
      `CREATE INDEX "transactions_linked_txn_idx" on "transactions" ("linked_txn_id")`,
      `CREATE INDEX "transactions_strategy_group_idx" on "transactions" ("strategy_group_id")`,
    );
  }

  if (steps.length > 0) await rebuildWithoutForeignKeys(db, steps);
}

export async function down(): Promise<void> {}
