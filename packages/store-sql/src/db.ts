import { mkdirSync } from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@tickrs/server/model.js';

export type DbConfig = { sqlitePath: string };
export type Db = Kysely<Database>;

export function createDb(cfg: DbConfig): Db {
  if (cfg.sqlitePath !== ':memory:') mkdirSync(path.dirname(cfg.sqlitePath), { recursive: true });
  const database = new BetterSqlite3(cfg.sqlitePath);
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  if (cfg.sqlitePath !== ':memory:') database.pragma('journal_mode = WAL');
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database }),
    plugins: [new CamelCasePlugin()],
  });
}
