import {
  FX_RATES_HEADER,
  parseFxRatesHeader,
  type CloudSyncEnvVar,
  type Edition,
  type FxRateRow,
} from '@tickrs/shared';
import { type Request, Router } from 'express';
import type { Logger } from 'pino';
import { capabilitiesOf } from '../capabilities.js';
import { createContext, type Ctx } from '../context.js';
import { AppError } from '../errors.js';
import { principalOf } from '../identity.js';
import type { ImportAi } from '../import/ai.js';
import type { CloudSyncConfig } from '../server-config.js';
import type { CryptoConfig } from '../services/providers.js';
import type { Store } from '../store/ports.js';
import { withRequestRates } from '../store/request-rates.js';
import { cloudSyncRoutes } from './cloud-sync.js';
import { importRoutes } from './import.js';
import { optionRoutes } from './options.js';
import { portfolioRoutes } from './portfolio.js';
import { providerRoutes } from './providers.js';
import { settingsRoutes } from './settings.js';
import { transactionRoutes } from './transactions.js';

function ratesOf(req: Request): FxRateRow[] {
  const header = req.get(FX_RATES_HEADER);
  try {
    return header ? parseFxRatesHeader(header) : [];
  } catch (err) {
    throw new AppError(
      'VALIDATION_FAILED',
      422,
      `Invalid ${FX_RATES_HEADER} header: ${(err as Error).message}`,
    );
  }
}

export interface ApiRouterOptions {
  edition?: Edition;
  authMode?: 'none' | 'session';
  cloudSync?: CloudSyncConfig;
  cloudSyncUnset?: CloudSyncEnvVar[];
  importAi?: ImportAi;
  logger?: Logger;
}

export function apiRouter(store: Store, config: CryptoConfig, options: ApiRouterOptions = {}): Router {
  const api = Router();
  const edition = options.edition ?? 'desktop';

  const contexts = new WeakMap<Request, Ctx>();
  const ctxOf = (req: Request): Ctx => {
    let ctx = contexts.get(req);
    if (!ctx) {
      ctx = createContext({
        store: withRequestRates(store, ratesOf(req)),
        crypto: config,
        principal: principalOf(req),
      });
      contexts.set(req, ctx);
    }
    return ctx;
  };

  api.get('/capabilities', (req, res) => {
    res.json(capabilitiesOf(ctxOf(req), options.authMode ?? 'none', edition));
  });

  settingsRoutes(api, ctxOf);
  transactionRoutes(api, ctxOf);
  cloudSyncRoutes(api, ctxOf, options);
  importRoutes(api, ctxOf, options.importAi, options.logger);
  portfolioRoutes(api, ctxOf);
  optionRoutes(api, ctxOf);
  providerRoutes(api, ctxOf);
  return api;
}
