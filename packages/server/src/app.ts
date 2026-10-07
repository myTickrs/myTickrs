import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import { DEFAULT_FX_RATE_URL } from '@tickrs/shared';
import { providerRegistry } from '@tickrs/market-data';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { ServerConfig } from './server-config.js';
import type { Store } from './store/ports.js';
import { AppError, type ErrorBody } from './errors.js';
import type { Identity } from './identity.js';
import { apiRouter } from './routes/index.js';
import { startPluginLoader } from './plugins/loader.js';
import { pluginsDirOf } from './services/providers.js';
import type { ImportAi } from './import/ai.js';
import { RemoteImportAi } from './import/remote-ai.js';

export interface AppDeps {
  config: Pick<
    ServerConfig,
    | 'env'
    | 'localKeyFile'
    | 'keyEncryptionKey'
    | 'repoRoot'
    | 'appsDir'
    | 'cloudSync'
    | 'cloudSyncUnset'
    | 'marketDataBaseProvider'
  >;
  identity: Identity;
  store: Store;
  logger: Logger;
  webDistDir?: string;
  importAi?: ImportAi;
}

export function createApp({ config, store, identity, logger, webDistDir, importAi }: AppDeps): Express {
  const app = express();

  if (config.env !== 'test') {
    const dir = pluginsDirOf(config);
    startPluginLoader({ dir, logger }).then(
      (loader) => logger.info({ dir: loader.dir }, 'Watching for data-provider plugins'),
      (err: unknown) => logger.error({ err, dir }, 'Could not start the data-provider plugin loader'),
    );
    if (config.marketDataBaseProvider !== undefined) {
      providerRegistry.setBaseProvider(config.marketDataBaseProvider || null);
    }
    if (process.env.MARKET_DATA_ROUTING) {
      logger.warn('MARKET_DATA_ROUTING is no longer used: providers are associated with markets instead');
    }
  }
  app.disable('x-powered-by');
  app.set('trust proxy', identity.mode === 'session' ? 1 : false);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          connectSrc: ["'self'", new URL(DEFAULT_FX_RATE_URL).origin],
          ...(identity.mode === 'session' ? {} : { upgradeInsecureRequests: null }),
        },
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  const api = express.Router();
  identity.routes?.(api);
  api.use(async (req, _res, next) => {
    req.principal = await identity.principal(req);
    next();
  });

  api.get('/health', async (_req, res) => {
    await store.ping();
    res.json({
      status: 'ok',
      store: store.name,
      authMode: identity.mode,
      time: new Date().toISOString(),
    });
  });

  api.use(
    apiRouter(store, config, {
      authMode: identity.mode,
      cloudSync: config.cloudSync,
      cloudSyncUnset: config.cloudSyncUnset,
      importAi:
        importAi ??
        (config.cloudSync
          ? new RemoteImportAi({
              config: config.cloudSync,
              fetch: (...args) => fetch(...args),
              now: () => new Date(),
              logger,
            })
          : undefined),
      logger,
    }),
  );

  api.use(((_req, _res, next) =>
    next(new AppError('NOT_FOUND', 404, 'No such API endpoint'))) as RequestHandler);

  app.use('/api/v1', api);

  if (webDistDir && existsSync(path.join(webDistDir, 'index.html'))) {
    app.use(express.static(webDistDir, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(webDistDir, 'index.html')));
  }

  app.use(errorHandler(logger));
  return app;
}

function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    let status = 500;
    let body: ErrorBody;
    if (err instanceof AppError) {
      status = err.status;
      body = { error: { code: err.code, message: err.message, details: err.details } };
    } else if (isBodyParserError(err)) {
      status = err.status;
      body = { error: { code: 'BAD_REQUEST', message: 'Malformed or oversized request body' } };
    } else {
      const correlationId = String(req.id ?? '');
      logger.error({ err, correlationId }, 'Unhandled error');
      body = { error: { code: 'INTERNAL', message: 'Internal server error', details: { correlationId } } };
    }
    res.status(status).json(body);
  };
}

function isBodyParserError(err: unknown): err is { status: number; type: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number'
  );
}
