import { type Kysely, sql } from 'kysely';

// oxlint-disable-next-line typescript/no-explicit-any
type AnyDb = Kysely<any>;

export async function columnNames(db: AnyDb, table: string): Promise<string[]> {
  const { rows } = await sql<{ name: string }>`select name from pragma_table_info(${table})`.execute(db);
  return rows.map((r) => r.name);
}

export async function tableSql(db: AnyDb, table: string): Promise<string> {
  const { rows } = await sql<{ sql: string }>`
    select sql from sqlite_master where type = 'table' and name = ${table}`.execute(db);
  return rows[0]?.sql ?? '';
}

export async function rebuildWithoutForeignKeys(db: AnyDb, statements: readonly string[]): Promise<void> {
  await sql`pragma foreign_keys = off`.execute(db);
  try {
    await db.transaction().execute(async (trx) => {
      for (const s of statements) await sql.raw(s).execute(trx);
      const { rows } = await sql`pragma foreign_key_check`.execute(trx);
      if (rows.length > 0) throw new Error(`foreign_key_check failed: ${JSON.stringify(rows)}`);
    });
  } finally {
    await sql`pragma foreign_keys = on`.execute(db);
  }
}
