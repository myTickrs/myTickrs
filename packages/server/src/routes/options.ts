import {
  contractTermsSchema,
  manualMarkSchema,
  resolveNeedsActionSchema,
  rollOptionSchema,
} from '@tickrs/shared';
import type { Router } from 'express';
import { type CtxOf, isConfirmed, parse, queryText } from '../http.js';
import {
  clearManualMark,
  deleteOptionPosition,
  getClosedOptionPositions,
  getContractTerms,
  getExpirations,
  getNeedsAction,
  getOptionIncome,
  getOptionPositions,
  lookupContractTerms,
  parseContractSymbol,
  resolveNeedsAction,
  saveContractTerms,
  setManualMark,
} from '../services/options.js';
import { rollOption } from '../services/rolls.js';

export function optionRoutes(api: Router, ctxOf: CtxOf): void {
  api.get('/options/positions', async (req, res) => {
    const accountId = queryText(req, 'accountId');
    res.json(
      req.query.status === 'closed'
        ? await getClosedOptionPositions(ctxOf(req), accountId)
        : await getOptionPositions(ctxOf(req), { accountId }),
    );
  });

  api.delete('/options/positions/:contractId', async (req, res) => {
    await deleteOptionPosition(ctxOf(req), req.params.contractId, {
      accountId: queryText(req, 'accountId'),
      confirmed: isConfirmed(req),
    });
    res.status(204).end();
  });

  api.get('/options/expirations', async (req, res) => {
    const withinDays = req.query.withinDays ? Number(req.query.withinDays) : 7;
    res.json(await getExpirations(ctxOf(req), withinDays, queryText(req, 'accountId')));
  });

  api.get('/options/needs-action', async (req, res) => {
    res.json(await getNeedsAction(ctxOf(req), queryText(req, 'accountId')));
  });

  api.post('/options/needs-action/resolve', async (req, res) => {
    const input = parse(resolveNeedsActionSchema, req.body);
    res.json(await resolveNeedsAction(ctxOf(req), input.items));
  });

  api.post('/options/rolls', async (req, res) => {
    const result = await rollOption(ctxOf(req), parse(rollOptionSchema, req.body));
    res.status(result.dryRun ? 200 : 201).json(result);
  });

  api.get('/options/income', async (req, res) => {
    res.json(await getOptionIncome(ctxOf(req), queryText(req, 'accountId')));
  });

  api.get('/options/contracts/parse', async (req, res) => {
    const symbol = String(req.query.symbol ?? req.query.occ ?? '');
    res.json(await parseContractSymbol(ctxOf(req), symbol, queryText(req, 'currency')?.toUpperCase()));
  });

  api.get('/options/contracts/terms', async (req, res) => {
    const right = queryText(req, 'right');
    res.json(
      await lookupContractTerms(ctxOf(req), {
        underlying: queryText(req, 'underlying') ?? '',
        expiration: queryText(req, 'expiration'),
        strike: queryText(req, 'strike'),
        right: right === 'CALL' || right === 'PUT' ? right : undefined,
        currency: queryText(req, 'currency')?.toUpperCase(),
      }),
    );
  });

  api.put('/options/contracts/:id/mark', async (req, res) => {
    const input = parse(manualMarkSchema, req.body);
    res.json(await setManualMark(ctxOf(req), req.params.id, input.mark, input.asOf));
  });

  api.delete('/options/contracts/:id/mark', async (req, res) => {
    await clearManualMark(ctxOf(req), req.params.id);
    res.status(204).end();
  });

  api.get('/options/contracts/:id/terms', async (req, res) => {
    res.json(await getContractTerms(ctxOf(req), req.params.id));
  });

  api.put('/options/contracts/:id/terms', async (req, res) => {
    const { confirmNegativeStock, ...terms } = parse(contractTermsSchema, req.body);
    res.json(await saveContractTerms(ctxOf(req), req.params.id, terms, confirmNegativeStock));
  });

  api.delete('/options/contracts/:id/terms', async (req, res) => {
    const confirm = req.query.confirmNegativeStock === 'true';
    res.json(await saveContractTerms(ctxOf(req), req.params.id, null, confirm));
  });
}
