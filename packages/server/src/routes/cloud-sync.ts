import {
  confirmCloudSyncSchema,
  startCloudSyncSchema,
  type CloudSyncEnvVar,
  type CloudSyncSettings,
} from '@tickrs/shared';
import type { Request, Router } from 'express';
import type { Logger } from 'pino';
import { AppError } from '../errors.js';
import { type CtxOf, parse, queryText } from '../http.js';
import { requireFeature } from '../identity.js';
import type { ImportAi } from '../import/ai.js';
import type { CloudSyncConfig } from '../server-config.js';
import { CloudSync, loopbackRedirectUri, syncCallbackPage } from '../services/cloud-sync.js';
import { CALLBACK_PAGE_CSP } from '../services/oauth-native.js';

export function requireLoopbackRedirect(req: Request, refusal: string): string {
  const redirectUri = loopbackRedirectUri(req.socket.remoteAddress, req.get('host'), req.socket.localPort);
  if (!redirectUri) throw new AppError('SYNC_NEEDS_LOCAL_BROWSER', 400, refusal);
  return redirectUri;
}

function callbackParams(req: Request) {
  return {
    state: queryText(req, 'state'),
    code: queryText(req, 'code'),
    error: queryText(req, 'error'),
    errorDescription: queryText(req, 'error_description'),
  };
}

export function cloudSyncRoutes(
  api: Router,
  ctxOf: CtxOf,
  options: {
    cloudSync?: CloudSyncConfig;
    cloudSyncUnset?: CloudSyncEnvVar[];
    importAi?: ImportAi;
    logger?: Logger;
  },
): void {
  const cloudSync = options.cloudSync
    ? new CloudSync({
        config: options.cloudSync,
        fetch: (...args) => fetch(...args),
        now: () => new Date(),
        logger: options.logger,
      })
    : undefined;
  const syncOf = (req: Request): CloudSync => {
    requireFeature(ctxOf(req), 'cloud-sync');
    if (!cloudSync) throw new AppError('SYNC_NOT_CONFIGURED', 503, 'No myTickrs cloud is configured here');
    return cloudSync;
  };

  api.get('/cloud-sync', async (req, res) => {
    const ctx = ctxOf(req);
    requireFeature(ctx, 'cloud-sync');
    const lastSync = cloudSync ? await cloudSync.lastSync(ctx) : undefined;
    const settings: CloudSyncSettings = {
      ...(cloudSync ? cloudSync.settings() : { providers: [] }),
      unset: options.cloudSyncUnset ?? [],
      ...(lastSync ? { lastSync } : {}),
    };
    res.json(settings);
  });

  api.post('/cloud-sync/sessions', (req, res) => {
    const sync = syncOf(req);
    const redirectUri = requireLoopbackRedirect(
      req,
      'Sync signs in through a browser on the computer running myTickrs. Open myTickrs there to sync.',
    );
    const input = parse(startCloudSyncSchema, req.body);
    res.status(201).json(sync.start(ctxOf(req), input, redirectUri));
  });

  api.get('/cloud-sync/callback', async (req, res) => {
    const params = callbackParams(req);
    res.setHeader('Content-Security-Policy', CALLBACK_PAGE_CSP);
    if (options.importAi?.signIn?.owns(params.state)) {
      res.type('html').send(await options.importAi.signIn.complete(params));
      return;
    }
    const sync = syncOf(req);
    try {
      const session = await sync.complete(params);
      res
        .status(session.status === 'failed' ? 400 : 200)
        .type('html')
        .send(syncCallbackPage(session));
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      res.status(error.status).type('html').send(syncCallbackPage(undefined, error.message));
    }
  });

  api.get('/cloud-sync/sessions/:id', (req, res) => {
    res.json(syncOf(req).get(req.params.id));
  });

  api.post('/cloud-sync/sessions/:id/confirm', (req, res) => {
    const sync = syncOf(req);
    res.json(sync.confirm(req.params.id, parse(confirmCloudSyncSchema, req.body)));
  });

  api.delete('/cloud-sync/sessions/:id', (req, res) => {
    syncOf(req).cancel(req.params.id);
    res.status(204).end();
  });
}
