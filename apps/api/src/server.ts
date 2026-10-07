import path from 'node:path';
import { createApp } from '@tickrs/server/app.js';
import { localIdentity } from '@tickrs/server/identity.js';
import { stopPluginLoaders } from '@tickrs/server/plugins/loader.js';
import { startDailyHolidaySync } from '@tickrs/server/services/holidays.js';
import { ConfigError, loadConfig } from './config.js';
import { browserUrl, openBrowser } from './open-browser.js';
import { ensureLocalUser } from '@tickrs/store-sql/bootstrap.js';
import { createKyselyStore } from '@tickrs/store-sql/store.js';
import { createDb } from '@tickrs/store-sql/db.js';
import { migrateToLatest } from '@tickrs/store-sql/migrate.js';
import { createLogger } from '@tickrs/server/logger.js';
import { localPrincipal } from '@tickrs/server/context.js';
import { startDailyFxSync } from '@tickrs/server/services/fx-history.js';
import { startBaseQuoteSweep } from '@tickrs/server/services/market-data.js';
import type { Logger } from 'pino';

let logger: Logger | undefined;

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config);
  logger = log;
  process.on('uncaughtExceptionMonitor', (err, origin) => log.fatal({ err, origin }, 'Uncaught exception'));
  if (config.cloudSyncUnset.length > 0) {
    log.warn(
      { unset: config.cloudSyncUnset },
      `Settings → Sync is not fully configured: ${config.cloudSyncUnset.join(', ')} not set in .env`,
    );
  }
  const db = createDb(config.db);

  await migrateToLatest(db);
  await ensureLocalUser(db);

  const webDistDir = path.resolve(import.meta.dirname, '../../web/dist');
  const store = createKyselyStore(db);
  const app = createApp({
    identity: localIdentity,
    config,
    store,
    logger: log,
    webDistDir,
  });
  const server = app.listen(config.port, config.host, (err?: Error) => {
    if (err) {
      const hint =
        (err as NodeJS.ErrnoException).code === 'EACCES' && process.platform === 'win32'
          ? ' — Windows may reserve this port (see `netsh interface ipv4 show excludedportrange protocol=tcp`); set PORT in .env'
          : (err as NodeJS.ErrnoException).code === 'EADDRINUSE'
            ? ' — another process is using this port; set PORT in .env'
            : '';
      log.fatal({ err }, `Could not listen on http://${config.host}:${config.port}: ${err.message}${hint}`);
      void db.destroy().finally(() => process.exit(1));
      return;
    }
    log.info({ db: config.db.sqlitePath }, `myTickrs API listening on http://${config.host}:${config.port}`);
    if (process.argv.includes('--open')) openBrowser(browserUrl(config.host, config.port));
  });

  const stopFxSync = startDailyFxSync({
    store,
    crypto: config,
    principals: async () => [localPrincipal()],
    logger: log,
  });

  const stopHolidaySync = startDailyHolidaySync({
    store,
    crypto: config,
    principals: async () => [localPrincipal()],
    logger: log,
  });

  const stopBaseSweep = startBaseQuoteSweep({
    store,
    crypto: config,
    principals: async () => [localPrincipal()],
    logger: log,
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopFxSync();
    stopHolidaySync();
    stopBaseSweep();
    stopPluginLoaders();
    log.info(`${signal} received, shutting down`);
    server.close(() => {
      db.destroy().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  if (logger) logger.fatal({ err }, 'myTickrs API failed to start');
  else console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
});
