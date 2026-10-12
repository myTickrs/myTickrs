import {
  marketCode,
  marketProvidersSchema,
  marketSchema,
  optionDataSourceSchema,
  providerKeySchema,
} from '@tickrs/shared';
import type { Router } from 'express';
import { AppError } from '../errors.js';
import { type CtxOf, parse } from '../http.js';
import { listPublicHolidays } from '../services/holidays.js';
import { deleteMarket, listMarkets, saveMarket } from '../services/markets.js';
import {
  listProviderSettings,
  removeProviderApiKey,
  resetMarketProviders,
  saveProviderApiKey,
  setMarketProviders,
  setOptionDataSource,
  testProviderApiKey,
} from '../services/providers.js';

export function providerRoutes(api: Router, ctxOf: CtxOf): void {
  api.get('/settings/providers', async (req, res) => {
    res.json(await listProviderSettings(ctxOf(req)));
  });

  api.put('/settings/providers/:provider/keys/:market', async (req, res) => {
    const { apiKey } = parse(providerKeySchema, req.body);
    const market = parse(marketCode, req.params.market);
    res.json(await saveProviderApiKey(ctxOf(req), req.params.provider, market, apiKey));
  });

  api.post('/settings/providers/:provider/keys/:market/test', async (req, res) => {
    const market = parse(marketCode, req.params.market);
    res.json(await testProviderApiKey(ctxOf(req), req.params.provider, market));
  });

  api.delete('/settings/providers/:provider/keys/:market', async (req, res) => {
    await removeProviderApiKey(ctxOf(req), req.params.provider, parse(marketCode, req.params.market));
    res.status(204).end();
  });

  api.put('/settings/market-providers/:market', async (req, res) => {
    const input = parse(marketProvidersSchema, req.body);
    res.json(await setMarketProviders(ctxOf(req), req.params.market, input));
  });

  api.delete('/settings/market-providers/:market', async (req, res) => {
    res.json(await resetMarketProviders(ctxOf(req), req.params.market));
  });

  api.get('/settings/markets', async (req, res) => {
    res.json(await listMarkets(ctxOf(req)));
  });

  api.get('/settings/markets/holidays/:country', async (req, res) => {
    const country = String(req.params.country).toUpperCase();
    const years = String(req.query.years ?? '')
      .split(',')
      .map(Number)
      .filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2100)
      .slice(0, 5);
    if (years.length === 0) {
      throw new AppError('VALIDATION_FAILED', 422, 'Give the years, e.g. ?years=2026,2027', {
        fields: { years: 'Required' },
      });
    }
    res.json(await listPublicHolidays(country, years));
  });

  api.post('/settings/markets', async (req, res) => {
    res.status(201).json(await saveMarket(ctxOf(req), null, parse(marketSchema, req.body)));
  });

  api.put('/settings/markets/:code', async (req, res) => {
    const code = parse(marketCode, req.params.code);
    res.json(await saveMarket(ctxOf(req), code, parse(marketSchema, { ...req.body, code })));
  });

  api.delete('/settings/markets/:code', async (req, res) => {
    await deleteMarket(ctxOf(req), parse(marketCode, req.params.code));
    res.status(204).end();
  });

  api.put('/settings/option-data-source', async (req, res) => {
    const { source } = parse(optionDataSourceSchema, req.body);
    res.json(await setOptionDataSource(ctxOf(req), source));
  });
}
