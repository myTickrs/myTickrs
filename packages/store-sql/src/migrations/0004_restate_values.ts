import type { Kysely } from 'kysely';

// oxlint-disable-next-line typescript/no-explicit-any
type AnyDb = Kysely<any>;

export async function up(migrationDb: AnyDb): Promise<void> {
  await migrationDb.withoutPlugins().deleteFrom('portfolio_snapshots').execute();
}

export async function down(): Promise<void> {}
