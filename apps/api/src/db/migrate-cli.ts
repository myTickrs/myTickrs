import { loadConfig } from '../config.js';
import { createDb } from '@tickrs/store-sql/db.js';
import { migrateToLatest } from '@tickrs/store-sql/migrate.js';

const config = loadConfig();
const db = createDb(config.db);
try {
  const { results = [] } = await migrateToLatest(db);
  if (results.length === 0) console.log(`${config.db.sqlitePath} is up to date.`);
  for (const r of results) console.log(`${r.status}: ${r.migrationName}`);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
