import {
  IMPORT_MAX_REQUEST_BYTES,
  IMPORT_MEDIA_TYPE,
  aiSignInSchema,
  commitRequestSchema,
  extractRequestSchema,
  reviewRequestSchema,
} from '@tickrs/shared';
import express, { type Router } from 'express';
import { AppError } from '../errors.js';
import { type CtxOf, parse } from '../http.js';
import { requireFeature } from '../identity.js';
import type { ImportAi } from '../import/ai.js';
import { checkImport, commitImport, extractFile, importConfig, reviewRows } from '../services/import.js';
import { signInMethod } from './cloud-sync.js';

export function importRoutes(api: Router, ctxOf: CtxOf, importAi: ImportAi | undefined): void {
  const importBody = express.json({ type: IMPORT_MEDIA_TYPE, limit: IMPORT_MAX_REQUEST_BYTES });

  api.get('/import/config', async (req, res) => {
    res.json(await importConfig(ctxOf(req), importAi));
  });

  api.post('/import/extract', importBody, async (req, res) => {
    res.json(await extractFile(ctxOf(req), importAi, parse(extractRequestSchema, req.body)));
  });

  api.post('/import/review', importBody, async (req, res) => {
    res.json(await reviewRows(ctxOf(req), parse(reviewRequestSchema, req.body)));
  });

  api.post('/import/check', importBody, async (req, res) => {
    const { importId: _importId, ...request } = parse(commitRequestSchema, req.body);
    res.json(await checkImport(ctxOf(req), request));
  });

  api.post('/import/commit', importBody, async (req, res) => {
    res.status(201).json(await commitImport(ctxOf(req), parse(commitRequestSchema, req.body)));
  });

  api.post('/import/ai/sign-in', async (req, res) => {
    requireFeature(ctxOf(req), 'ai-import');
    if (!importAi?.signIn)
      throw new AppError('IMPORT_UNAVAILABLE', 503, 'There is nothing to sign in to here');
    const refusal =
      'Signing in uses a browser on the computer running myTickrs. Open myTickrs there to sign in.';
    const method = signInMethod(req, refusal);
    const { provider } = parse(aiSignInSchema, req.body);
    res.status(201).json(await importAi.signIn.start(provider, method, refusal));
  });

  api.delete('/import/ai/sign-in', (_req, res) => {
    importAi?.signIn?.signOut();
    res.status(204).end();
  });
}
