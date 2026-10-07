import type { Kysely } from 'kysely';
import { type MigrationResultSet, Migrator, NO_MIGRATIONS } from 'kysely/migration';
import { migrations } from './migrations/index.js';

function migrator<DB>(db: Kysely<DB>): Migrator {
  return new Migrator({ db, provider: { getMigrations: async () => migrations } });
}

function unwrap(result: MigrationResultSet): MigrationResultSet {
  if (result.error) {
    const failed = result.results?.find((r) => r.status === 'Error');
    const where = failed ? ` (in migration "${failed.migrationName}")` : '';
    throw new Error(`Database migration failed${where}: ${String(result.error)}`, { cause: result.error });
  }
  return result;
}

export async function migrateToLatest<DB>(db: Kysely<DB>): Promise<MigrationResultSet> {
  return unwrap(await migrator(db).migrateToLatest());
}

export async function migrateDownToEmpty<DB>(db: Kysely<DB>): Promise<MigrationResultSet> {
  return unwrap(await migrator(db).migrateTo(NO_MIGRATIONS));
}
