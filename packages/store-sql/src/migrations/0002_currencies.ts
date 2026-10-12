import { type Kysely, sql } from 'kysely';

// oxlint-disable-next-line typescript/no-explicit-any
type AnyDb = Kysely<any>;

export async function up(db: AnyDb): Promise<void> {
  await db.schema
    .createTable('currencies')
    .addColumn('user_id', 'text', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('code', 'text', (c) => c.notNull())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addPrimaryKeyConstraint('currencies_pk', ['user_id', 'code'])
    .addCheckConstraint('currencies_code_ck', sql`length(code) = 3 and code = upper(code)`)
    .execute();
}

export const TABLES = ['currencies'] as const;

export async function down(db: AnyDb): Promise<void> {
  await db.schema.dropTable('currencies').execute();
}
