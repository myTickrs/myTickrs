import {
  ASSET_CLASSES,
  BORROW_FEE_TREATMENTS,
  CORPORATE_ACTION_TYPES,
  AVERAGE_PRICE_SCOPES,
  FEE_SOURCES,
  MARKET_PROVIDER_PRIORITY_MIN,
  OPTION_DATA_SOURCES,
  OPTION_RIGHTS,
  OPTION_SETTLEMENTS,
  OPTION_STYLES,
  PREMIUM_TREATMENTS,
  PROVIDER_KEY_STATUSES,
  SECURITY_TYPES,
  SHORT_BUY_HANDLINGS,
  STRATEGY_GROUP_KINDS,
  STRATEGY_TAGS,
  TRANSACTION_TYPES_BY_ASSET_CLASS,
} from '@tickrs/shared';
import { type Kysely, type RawBuilder, sql } from 'kysely';

// oxlint-disable-next-line typescript/no-explicit-any
type AnyDb = Kysely<any>;

const COLUMN_TYPES = { id: 'text', date: 'text', ts: 'text', dec: 'text' } as const;

const lit = (values: readonly string[]) => sql.join(values.map((v) => sql.lit(v)));

function isIn(column: string, values: readonly string[]): RawBuilder<unknown> {
  return sql`${sql.ref(column)} in (${lit(values)})`;
}

function isFlag(column: string): RawBuilder<unknown> {
  return sql`${sql.ref(column)} in (0, 1)`;
}

export async function up(db: AnyDb): Promise<void> {
  const t = COLUMN_TYPES;

  await db.schema
    .createTable('users')
    .addColumn('id', t.id, (c) => c.primaryKey())
    .addColumn('email', 'text', (c) => c.unique())
    .addColumn('base_currency', 'text', (c) => c.notNull().defaultTo('USD'))
    .addColumn('average_price_scope', 'text', (c) => c.notNull().defaultTo('CURRENT'))
    .addColumn('option_premium_treatment', 'text', (c) => c.notNull().defaultTo('ROLL_INTO_STOCK'))
    .addColumn('auto_expire_otm', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('short_buy_handling', 'text', (c) => c.notNull().defaultTo('BLOCK'))
    .addColumn('borrow_fee_treatment', 'text', (c) => c.notNull().defaultTo('REALIZED'))
    .addColumn('option_data_source', 'text', (c) => c.notNull().defaultTo('none'))
    .addColumn('created_at', t.ts, (c) => c.notNull())
    .addColumn('updated_at', t.ts, (c) => c.notNull())
    .addCheckConstraint('users_average_price_scope_ck', isIn('average_price_scope', AVERAGE_PRICE_SCOPES))
    .addCheckConstraint('users_premium_treatment_ck', isIn('option_premium_treatment', PREMIUM_TREATMENTS))
    .addCheckConstraint('users_auto_expire_otm_ck', isFlag('auto_expire_otm'))
    .addCheckConstraint('users_short_buy_handling_ck', isIn('short_buy_handling', SHORT_BUY_HANDLINGS))
    .addCheckConstraint('users_borrow_fee_treatment_ck', isIn('borrow_fee_treatment', BORROW_FEE_TREATMENTS))
    .addCheckConstraint('users_option_data_source_ck', isIn('option_data_source', OPTION_DATA_SOURCES))
    .execute();

  await db.schema
    .createTable('fee_schedules')
    .addColumn('id', t.id, (c) => c.primaryKey())
    .addColumn('user_id', t.id, (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('preset_key', 'text')
    .addColumn('stock_per_order', t.dec)
    .addColumn('stock_per_share', t.dec)
    .addColumn('stock_min_per_order', t.dec)
    .addColumn('stock_max_per_order', t.dec)
    .addColumn('stock_max_pct_of_value', t.dec)
    .addColumn('option_per_order', t.dec)
    .addColumn('option_per_contract', t.dec)
    .addColumn('option_min_per_order', t.dec)
    .addColumn('option_max_per_order', t.dec)
    .addColumn('assignment_fee', t.dec)
    .addColumn('exercise_fee', t.dec)
    .addColumn('sec_fee_rate', t.dec)
    .addColumn('taf_per_share', t.dec)
    .addColumn('taf_per_contract', t.dec)
    .addColumn('taf_max_per_trade', t.dec)
    .addColumn('orf_per_contract', t.dec)
    .addColumn('created_at', t.ts, (c) => c.notNull())
    .addColumn('updated_at', t.ts, (c) => c.notNull())
    .execute();
  await db.schema.createIndex('fee_schedules_user_idx').on('fee_schedules').column('user_id').execute();

  await db.schema
    .createTable('accounts')
    .addColumn('id', t.id, (c) => c.primaryKey())
    .addColumn('user_id', t.id, (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('broker', 'text')
    .addColumn('currency', 'text', (c) => c.notNull().defaultTo('USD'))
    .addColumn('fee_schedule_id', t.id, (c) => c.references('fee_schedules.id').onDelete('set null'))
    .addColumn('created_at', t.ts, (c) => c.notNull())
    .addColumn('updated_at', t.ts, (c) => c.notNull())
    .execute();
  await db.schema.createIndex('accounts_user_idx').on('accounts').column('user_id').execute();

  await db.schema
    .createTable('securities')
    .addColumn('symbol', 'text', (c) => c.primaryKey())
    .addColumn('exchange', 'text')
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('currency', 'text', (c) => c.notNull().defaultTo('USD'))
    .addColumn('type', 'text', (c) => c.notNull())
    .addColumn('sector', 'text')
    .addColumn('updated_at', t.ts, (c) => c.notNull())
    .addCheckConstraint('securities_type_ck', isIn('type', SECURITY_TYPES))
    .execute();

  await db.schema
    .createTable('option_contracts')
    .addColumn('id', t.id, (c) => c.primaryKey())
    .addColumn('contract_key', 'text', (c) => c.notNull().unique())
    .addColumn('underlying_symbol', 'text', (c) => c.notNull().references('securities.symbol'))
    .addColumn('expiration', t.date, (c) => c.notNull())
    .addColumn('strike', t.dec, (c) => c.notNull())
    .addColumn('option_right', 'text', (c) => c.notNull())
    .addColumn('multiplier', t.dec, (c) => c.notNull().defaultTo('100'))
    .addColumn('style', 'text', (c) => c.notNull().defaultTo('AMERICAN'))
    .addColumn('settlement', 'text', (c) => c.notNull().defaultTo('PHYSICAL'))
    .addColumn('created_at', t.ts, (c) => c.notNull())
    .addCheckConstraint('option_contracts_right_ck', isIn('option_right', OPTION_RIGHTS))
    .addCheckConstraint('option_contracts_style_ck', isIn('style', OPTION_STYLES))
    .addCheckConstraint('option_contracts_settlement_ck', isIn('settlement', OPTION_SETTLEMENTS))
    .execute();
  await db.schema
    .createIndex('option_contracts_underlying_exp_idx')
    .on('option_contracts')
    .columns(['underlying_symbol', 'expiration'])
    .execute();

  await db.schema
    .createTable('strategy_groups')
    .addColumn('id', t.id, (c) => c.primaryKey())
    .addColumn('user_id', t.id, (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('strategy_tag', 'text')
    .addColumn('name', 'text')
    .addColumn('created_at', t.ts, (c) => c.notNull())
    .addColumn('updated_at', t.ts, (c) => c.notNull())
    .addCheckConstraint('strategy_groups_kind_ck', isIn('kind', STRATEGY_GROUP_KINDS))
    .addCheckConstraint(
      'strategy_groups_tag_ck',
      sql`strategy_tag is null or ${isIn('strategy_tag', STRATEGY_TAGS)}`,
    )
    .execute();

  const typeMatchesAssetClass = sql.join(
    ASSET_CLASSES.map(
      (ac) => sql`(asset_class = ${sql.lit(ac)} and ${isIn('type', TRANSACTION_TYPES_BY_ASSET_CLASS[ac])})`,
    ),
    sql` or `,
  );

  await db.schema
    .createTable('transactions')
    .addColumn('id', t.id, (c) => c.primaryKey())
    .addColumn('account_id', t.id, (c) => c.notNull().references('accounts.id').onDelete('cascade'))
    .addColumn('asset_class', 'text', (c) => c.notNull())
    .addColumn('symbol', 'text', (c) => c.notNull().references('securities.symbol'))
    .addColumn('option_contract_id', t.id, (c) => c.references('option_contracts.id'))
    .addColumn('type', 'text', (c) => c.notNull())
    .addColumn('trade_date', t.date, (c) => c.notNull())
    .addColumn('quantity', t.dec)
    .addColumn('price', t.dec)
    .addColumn('fee', t.dec, (c) => c.notNull().defaultTo('0'))
    .addColumn('amount', t.dec)
    .addColumn('split_from', t.dec)
    .addColumn('split_to', t.dec)
    .addColumn('currency', 'text', (c) => c.notNull().defaultTo('USD'))
    .addColumn('linked_txn_id', t.id, (c) => c.references('transactions.id'))
    .addColumn('is_system_generated', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('is_auto_expired', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('strategy_group_id', t.id, (c) => c.references('strategy_groups.id').onDelete('set null'))
    .addColumn('fee_source', 'text', (c) => c.notNull().defaultTo('MANUAL'))
    .addColumn('fee_commission', t.dec)
    .addColumn('fee_regulatory', t.dec)
    .addColumn('realized_before', t.dec)
    .addColumn('strategy_tag', 'text')
    .addColumn('notes', 'text')
    .addColumn('created_at', t.ts, (c) => c.notNull())
    .addColumn('updated_at', t.ts, (c) => c.notNull())
    .addCheckConstraint('transactions_asset_class_ck', isIn('asset_class', ASSET_CLASSES))
    .addCheckConstraint('transactions_type_matches_class_ck', typeMatchesAssetClass)
    .addCheckConstraint(
      'transactions_option_contract_ck',
      sql`(asset_class = 'OPTION') = (option_contract_id is not null)`,
    )
    .addCheckConstraint('transactions_system_generated_ck', isFlag('is_system_generated'))
    .addCheckConstraint('transactions_auto_expired_ck', isFlag('is_auto_expired'))
    .addCheckConstraint('transactions_fee_source_ck', isIn('fee_source', FEE_SOURCES))
    .addCheckConstraint(
      'transactions_strategy_tag_ck',
      sql`strategy_tag is null or ${isIn('strategy_tag', STRATEGY_TAGS)}`,
    )
    .execute();
  await db.schema
    .createIndex('transactions_account_symbol_date_idx')
    .on('transactions')
    .columns(['account_id', 'symbol', 'trade_date'])
    .execute();
  await db.schema
    .createIndex('transactions_account_contract_date_idx')
    .on('transactions')
    .columns(['account_id', 'option_contract_id', 'trade_date'])
    .execute();
  await db.schema
    .createIndex('transactions_strategy_group_idx')
    .on('transactions')
    .column('strategy_group_id')
    .execute();
  await db.schema
    .createIndex('transactions_linked_txn_idx')
    .on('transactions')
    .column('linked_txn_id')
    .execute();

  await db.schema
    .createTable('manual_option_marks')
    .addColumn('user_id', t.id, (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('option_contract_id', t.id, (c) => c.notNull().references('option_contracts.id'))
    .addColumn('mark', t.dec, (c) => c.notNull())
    .addColumn('as_of', t.date, (c) => c.notNull())
    .addColumn('updated_at', t.ts, (c) => c.notNull())
    .addPrimaryKeyConstraint('manual_option_marks_pk', ['user_id', 'option_contract_id'])
    .execute();

  await db.schema
    .createTable('option_contract_adjustments')
    .addColumn('user_id', t.id, (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('option_contract_id', t.id, (c) => c.notNull().references('option_contracts.id'))
    .addColumn('multiplier', t.dec)
    .addColumn('deliverable_shares', t.dec)
    .addColumn('cash_in_lieu', t.dec)
    .addColumn('strike', t.dec)
    .addColumn('quote_symbol', 'text')
    .addColumn('display_name', 'text')
    .addColumn('note', 'text')
    .addColumn('created_at', t.ts, (c) => c.notNull())
    .addColumn('updated_at', t.ts, (c) => c.notNull())
    .addPrimaryKeyConstraint('option_contract_adjustments_pk', ['user_id', 'option_contract_id'])
    .execute();

  await db.schema
    .createTable('user_provider_keys')
    .addColumn('user_id', t.id, (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('provider', 'text', (c) => c.notNull())
    .addColumn('market', 'text', (c) => c.notNull())
    .addColumn('api_key_ciphertext', 'text', (c) => c.notNull())
    .addColumn('api_key_iv', 'text', (c) => c.notNull())
    .addColumn('api_key_auth_tag', 'text', (c) => c.notNull())
    .addColumn('key_hint', 'text', (c) => c.notNull())
    .addColumn('enabled', 'integer', (c) => c.notNull().defaultTo(1))
    .addColumn('status', 'text', (c) => c.notNull().defaultTo('UNTESTED'))
    .addColumn('last_verified_at', t.ts)
    .addColumn('created_at', t.ts, (c) => c.notNull())
    .addColumn('updated_at', t.ts, (c) => c.notNull())
    .addPrimaryKeyConstraint('user_provider_keys_pk', ['user_id', 'provider', 'market'])
    .addCheckConstraint('user_provider_keys_enabled_ck', isFlag('enabled'))
    .addCheckConstraint('user_provider_keys_status_ck', isIn('status', PROVIDER_KEY_STATUSES))
    .execute();

  await db.schema
    .createTable('markets')
    .addColumn('user_id', t.id, (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('code', 'text', (c) => c.notNull())
    .addColumn('position', 'integer', (c) => c.notNull())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('country', 'text')
    .addColumn('timezone', 'text', (c) => c.notNull())
    .addColumn('sessions', 'text', (c) => c.notNull())
    .addColumn('weekdays', 'text', (c) => c.notNull())
    .addColumn('closed_days', 'text', (c) => c.notNull())
    .addColumn('holidays_through', 'integer')
    .addColumn('currency', 'text', (c) => c.notNull())
    .addColumn('suffixes', 'text', (c) => c.notNull())
    .addColumn('test_symbol', 'text', (c) => c.notNull())
    .addColumn('created_at', t.ts, (c) => c.notNull())
    .addColumn('updated_at', t.ts, (c) => c.notNull())
    .addPrimaryKeyConstraint('markets_pk', ['user_id', 'code'])
    .execute();

  await db.schema
    .createTable('user_market_providers')
    .addColumn('user_id', t.id, (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('market', 'text', (c) => c.notNull())
    .addColumn('provider', 'text', (c) => c.notNull())
    .addColumn('priority', 'integer', (c) => c.notNull())
    .addColumn('enabled', 'integer', (c) => c.notNull().defaultTo(1))
    .addColumn('created_at', t.ts, (c) => c.notNull())
    .addColumn('updated_at', t.ts, (c) => c.notNull())
    .addPrimaryKeyConstraint('user_market_providers_pk', ['user_id', 'market', 'provider'])
    .addCheckConstraint(
      'user_market_providers_priority_ck',
      sql`priority >= ${sql.lit(MARKET_PROVIDER_PRIORITY_MIN)}`,
    )
    .addCheckConstraint('user_market_providers_enabled_ck', isFlag('enabled'))
    .execute();

  await db.schema
    .createTable('provider_usage')
    .addColumn('user_id', t.id, (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('provider', 'text', (c) => c.notNull())
    .addColumn('market', 'text', (c) => c.notNull())
    .addColumn('date', t.date, (c) => c.notNull())
    .addColumn('request_count', 'integer', (c) => c.notNull().defaultTo(0))
    .addPrimaryKeyConstraint('provider_usage_pk', ['user_id', 'provider', 'market', 'date'])
    .execute();

  await db.schema
    .createTable('price_daily')
    .addColumn('symbol', 'text', (c) => c.notNull())
    .addColumn('date', t.date, (c) => c.notNull())
    .addColumn('open', t.dec)
    .addColumn('high', t.dec)
    .addColumn('low', t.dec)
    .addColumn('close', t.dec, (c) => c.notNull())
    .addColumn('adj_close', t.dec)
    .addColumn('volume', t.dec)
    .addColumn('source', 'text', (c) => c.notNull())
    .addPrimaryKeyConstraint('price_daily_pk', ['symbol', 'date'])
    .execute();

  await db.schema
    .createTable('price_latest')
    .addColumn('symbol', 'text', (c) => c.notNull())
    .addColumn('price', t.dec, (c) => c.notNull())
    .addColumn('change', t.dec)
    .addColumn('change_pct', t.dec)
    .addColumn('open', t.dec)
    .addColumn('high', t.dec)
    .addColumn('low', t.dec)
    .addColumn('previous_close', t.dec)
    .addColumn('source', 'text', (c) => c.notNull())
    .addColumn('as_of', t.ts, (c) => c.notNull())
    .addColumn('fetched_at', t.ts, (c) => c.notNull())
    .addPrimaryKeyConstraint('price_latest_pk', ['symbol'])
    .execute();

  await db.schema
    .createTable('option_quote_daily')
    .addColumn('owner_id', t.id, (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('option_contract_id', t.id, (c) => c.notNull().references('option_contracts.id'))
    .addColumn('date', t.date, (c) => c.notNull())
    .addColumn('bid', t.dec)
    .addColumn('ask', t.dec)
    .addColumn('last', t.dec)
    .addColumn('mark', t.dec)
    .addColumn('volume', t.dec)
    .addColumn('open_interest', t.dec)
    .addColumn('iv', t.dec)
    .addColumn('delta', t.dec)
    .addColumn('theta', t.dec)
    .addColumn('source', 'text', (c) => c.notNull())
    .addPrimaryKeyConstraint('option_quote_daily_pk', ['owner_id', 'option_contract_id', 'date'])
    .execute();

  await db.schema
    .createTable('option_quote_latest')
    .addColumn('owner_id', t.id, (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('option_contract_id', t.id, (c) => c.notNull().references('option_contracts.id'))
    .addColumn('bid', t.dec)
    .addColumn('ask', t.dec)
    .addColumn('last', t.dec)
    .addColumn('mark', t.dec)
    .addColumn('iv', t.dec)
    .addColumn('delta', t.dec)
    .addColumn('gamma', t.dec)
    .addColumn('theta', t.dec)
    .addColumn('vega', t.dec)
    .addColumn('previous_close', t.dec)
    .addColumn('source', 'text', (c) => c.notNull())
    .addColumn('as_of', t.ts, (c) => c.notNull())
    .addColumn('fetched_at', t.ts, (c) => c.notNull())
    .addPrimaryKeyConstraint('option_quote_latest_pk', ['owner_id', 'option_contract_id'])
    .execute();

  await db.schema
    .createTable('fx_daily')
    .addColumn('base', 'text', (c) => c.notNull())
    .addColumn('quote', 'text', (c) => c.notNull())
    .addColumn('date', t.date, (c) => c.notNull())
    .addColumn('rate', t.dec, (c) => c.notNull())
    .addColumn('source', 'text', (c) => c.notNull())
    .addPrimaryKeyConstraint('fx_daily_pk', ['base', 'quote', 'date'])
    .execute();

  await db.schema
    .createTable('corporate_actions')
    .addColumn('symbol', 'text', (c) => c.notNull())
    .addColumn('date', t.date, (c) => c.notNull())
    .addColumn('type', 'text', (c) => c.notNull())
    .addColumn('ratio_from', t.dec)
    .addColumn('ratio_to', t.dec)
    .addColumn('amount', t.dec)
    .addColumn('source', 'text', (c) => c.notNull())
    .addPrimaryKeyConstraint('corporate_actions_pk', ['symbol', 'date', 'type'])
    .addCheckConstraint('corporate_actions_type_ck', isIn('type', CORPORATE_ACTION_TYPES))
    .execute();

  await db.schema
    .createTable('portfolio_snapshots')
    .addColumn('account_id', t.id, (c) => c.notNull().references('accounts.id').onDelete('cascade'))
    .addColumn('date', t.date, (c) => c.notNull())
    .addColumn('positions_value', t.dec, (c) => c.notNull())
    .addColumn('market_value', t.dec, (c) => c.notNull())
    .addColumn('net_contributions', t.dec, (c) => c.notNull())
    .addColumn('twr_index', t.dec, (c) => c.notNull())
    .addColumn('is_estimated', 'integer', (c) => c.notNull().defaultTo(0))
    .addPrimaryKeyConstraint('portfolio_snapshots_pk', ['account_id', 'date'])
    .addCheckConstraint('portfolio_snapshots_estimated_ck', isFlag('is_estimated'))
    .execute();

  await db.schema
    .createTable('sessions')
    .addColumn('sid', 'text', (c) => c.primaryKey())
    .addColumn('user_id', t.id, (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('expires_at', t.ts, (c) => c.notNull())
    .addColumn('data', 'text', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('sessions_expires_idx').on('sessions').column('expires_at').execute();

  await db.schema
    .createTable('import_mappings')
    .addColumn('user_id', t.id, (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('fingerprint', 'text', (c) => c.notNull())
    .addColumn('format', 'text', (c) => c.notNull())
    .addColumn('mapping', 'text', (c) => c.notNull())
    .addColumn('created_at', t.ts, (c) => c.notNull())
    .addColumn('updated_at', t.ts, (c) => c.notNull())
    .addPrimaryKeyConstraint('import_mappings_pk', ['user_id', 'fingerprint'])
    .execute();

  await db.schema
    .createTable('sync_base')
    .addColumn('user_id', t.id, (c) => c.primaryKey().references('users.id').onDelete('cascade'))
    .addColumn('cloud_url', 'text', (c) => c.notNull())
    .addColumn('account', 'text', (c) => c.notNull())
    .addColumn('local_fingerprint', 'text', (c) => c.notNull())
    .addColumn('cloud_fingerprint', 'text', (c) => c.notNull())
    .addColumn('synced_at', t.ts, (c) => c.notNull())
    .execute();
}

export const TABLES_IN_CREATION_ORDER = [
  'users',
  'fee_schedules',
  'accounts',
  'securities',
  'option_contracts',
  'strategy_groups',
  'transactions',
  'manual_option_marks',
  'option_contract_adjustments',
  'user_provider_keys',
  'markets',
  'user_market_providers',
  'provider_usage',
  'price_daily',
  'price_latest',
  'option_quote_daily',
  'option_quote_latest',
  'fx_daily',
  'corporate_actions',
  'portfolio_snapshots',
  'sessions',
  'import_mappings',
  'sync_base',
] as const;

export async function down(db: AnyDb): Promise<void> {
  for (const table of TABLES_IN_CREATION_ORDER.toReversed()) {
    await db.schema.dropTable(table).execute();
  }
}
