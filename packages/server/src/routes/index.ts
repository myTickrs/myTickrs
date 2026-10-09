import { FEE_PRESETS } from '@tickrs/core';
import {
  accountBatchSchema,
  accountPatchSchema,
  accountSchema,
  contractTermsSchema,
  createTransactionSchema,
  currencyCode,
  currencySchema,
  feeQuoteSchema,
  feeScheduleSchema,
  manualMarkSchema,
  marketCode,
  marketProvidersSchema,
  marketSchema,
  optionDataSourceSchema,
  providerKeySchema,
  resolveNeedsActionSchema,
  rollOptionSchema,
  settingsSchema,
  startCloudSyncSchema,
  confirmCloudSyncSchema,
  transactionQuerySchema,
  updateTransactionSchema,
} from '@tickrs/shared';
import {
  FX_RATES_HEADER,
  parseFxRatesHeader,
  type CloudSyncEnvVar,
  type CloudSyncSettings,
  type Edition,
  type FxRateRow,
} from '@tickrs/shared';
import express, { type Request, Router } from 'express';
import {
  IMPORT_MAX_REQUEST_BYTES,
  IMPORT_MEDIA_TYPE,
  aiSignInSchema,
  commitRequestSchema,
  extractRequestSchema,
  reviewRequestSchema,
} from '@tickrs/shared';
import type { ImportAi } from '../import/ai.js';
import { checkImport, commitImport, extractFile, importConfig, reviewRows } from '../services/import.js';
import { createContext, type Ctx } from '../context.js';
import { principalOf, requireFeature } from '../identity.js';
import { capabilitiesOf } from '../capabilities.js';
import type { Store, UserRow } from '../store/ports.js';
import { withRequestRates } from '../store/request-rates.js';
import { getMarketDataStatus, refreshPortfolioData, searchSymbols } from '../services/market-data.js';
import {
  type CryptoConfig,
  listProviderSettings,
  removeProviderApiKey,
  resetMarketProviders,
  setMarketProviders,
  saveProviderApiKey,
  setOptionDataSource,
  testProviderApiKey,
} from '../services/providers.js';
import { deleteMarket, listMarkets, saveMarket } from '../services/markets.js';
import { listPublicHolidays } from '../services/holidays.js';
import { AppError } from '../errors.js';
import { isConfirmed, parse } from '../http.js';
import { quoteFee } from '../services/fees.js';
import { getHoldings, getHoldingsByAccount, getPortfolioSummary } from '../services/portfolio.js';
import { getPerformance, RANGES, type Range } from '../services/performance.js';
import { getStockChart } from '../services/stock-chart.js';
import { rollOption } from '../services/rolls.js';
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
import { getFxRate } from '../services/fx.js';
import { createAccount, createAccounts, updateAccount } from '../services/accounts.js';
import { addCurrency, deleteCurrency, listCurrencies, requireCurrency } from '../services/currencies.js';
import { loadLedgerContext } from '../services/ledger-context.js';
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from '../services/transactions.js';
import { CloudSync, loopbackRedirectUri, syncCallbackPage } from '../services/cloud-sync.js';
import { CALLBACK_PAGE_CSP } from '../services/oauth-native.js';
import type { CloudSyncConfig } from '../server-config.js';
import type { Logger } from 'pino';

const parsedRates = new WeakMap<Request, FxRateRow[]>();
function ratesOf(req: Request): FxRateRow[] {
  let rows = parsedRates.get(req);
  if (!rows) {
    const header = req.get(FX_RATES_HEADER);
    try {
      rows = header ? parseFxRatesHeader(header) : [];
    } catch (err) {
      throw new AppError(
        'VALIDATION_FAILED',
        422,
        `Invalid ${FX_RATES_HEADER} header: ${(err as Error).message}`,
      );
    }
    parsedRates.set(req, rows);
  }
  return rows;
}

function settingsOf(user: UserRow) {
  return {
    baseCurrency: user.baseCurrency,
    averagePriceScope: user.averagePriceScope,
    optionPremiumTreatment: user.optionPremiumTreatment,
    autoExpireOtm: user.autoExpireOtm === 1,
    shortBuyHandling: user.shortBuyHandling,
    borrowFeeTreatment: user.borrowFeeTreatment,
    optionDataSource: user.optionDataSource,
  };
}

export function apiRouter(
  store: Store,
  config: CryptoConfig,
  options: {
    edition?: Edition;
    authMode?: 'none' | 'session';
    cloudSync?: CloudSyncConfig;
    cloudSyncUnset?: CloudSyncEnvVar[];
    importAi?: ImportAi;
    logger?: Logger;
  } = {},
): Router {
  const api = Router();
  const edition = options.edition ?? 'desktop';

  const ctxOf = (req: Request): Ctx =>
    createContext({
      store: withRequestRates(store, ratesOf(req)),
      crypto: config,
      principal: principalOf(req),
    });

  api.get('/capabilities', (req, res) => {
    res.json(capabilitiesOf(ctxOf(req), options.authMode ?? 'none', edition));
  });

  api.get('/health', async (_req, res) => {
    await store.ping();
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  api.get('/settings', async (req, res) => {
    res.json(settingsOf(await ctxOf(req).data.users.require()));
  });

  api.patch('/settings', async (req, res) => {
    const input = parse(settingsSchema, req.body);
    const user = await ctxOf(req).data.users.require();
    if (input.baseCurrency) await requireCurrency(ctxOf(req).data, input.baseCurrency);
    await ctxOf(req).data.users.updateSettings({
      baseCurrency: input.baseCurrency,
      averagePriceScope: input.averagePriceScope,
      optionPremiumTreatment: input.optionPremiumTreatment,
      autoExpireOtm: input.autoExpireOtm === undefined ? undefined : input.autoExpireOtm ? 1 : 0,
      shortBuyHandling: input.shortBuyHandling,
      borrowFeeTreatment: input.borrowFeeTreatment,
    });
    if (input.baseCurrency && input.baseCurrency !== user.baseCurrency) {
      await ctxOf(req).data.snapshots.invalidateUser();
    }
    res.json(settingsOf(await ctxOf(req).data.users.require()));
  });

  api.get('/currencies', async (req, res) => {
    res.json(await listCurrencies(ctxOf(req)));
  });

  api.post('/currencies', async (req, res) => {
    res.status(201).json(await addCurrency(ctxOf(req), parse(currencySchema, req.body)));
  });

  api.delete('/currencies/:code', async (req, res) => {
    await deleteCurrency(ctxOf(req), parse(currencyCode, req.params.code, 'params'));
    res.status(204).end();
  });

  api.get('/accounts', async (req, res) => {
    res.json({ items: await ctxOf(req).data.accounts.list() });
  });

  api.post('/accounts', async (req, res) => {
    const account = await createAccount(ctxOf(req), parse(accountSchema, req.body));
    res.status(201).json(account);
  });

  api.post('/accounts/batch', async (req, res) => {
    const { items } = parse(accountBatchSchema, req.body);
    res.status(201).json({ items: await createAccounts(ctxOf(req), items) });
  });

  api.patch('/accounts/:id', async (req, res) => {
    const input = parse(accountPatchSchema, req.body);
    res.json(await updateAccount(ctxOf(req), req.params.id, input));
  });

  api.delete('/accounts/:id', async (req, res) => {
    if (!isConfirmed(req)) {
      throw new AppError('CONFIRMATION_REQUIRED', 409, 'Deleting an account removes all of its transactions');
    }
    await ctxOf(req).data.accounts.delete(req.params.id);
    res.status(204).end();
  });

  api.get('/fee-presets', (_req, res) => {
    res.json({
      items: Object.entries(FEE_PRESETS).map(([key, preset]) => ({
        key,
        name: preset.name,
        schedule: preset.schedule,
      })),
    });
  });

  api.get('/accounts/:id/fee-schedule', async (req, res) => {
    const account = await ctxOf(req).data.accounts.require(req.params.id);
    res.json((await ctxOf(req).data.feeSchedules.find(account.feeScheduleId)) ?? null);
  });

  api.put('/accounts/:id/fee-schedule', async (req, res) => {
    await ctxOf(req).data.accounts.require(req.params.id);
    const input = parse(feeScheduleSchema, req.body);
    res.json(await ctxOf(req).data.feeSchedules.saveForAccount(req.params.id, input));
  });

  api.post('/fees/quote', async (req, res) => {
    res.json(await quoteFee(ctxOf(req), parse(feeQuoteSchema, req.body)));
  });

  api.get('/transactions', async (req, res) => {
    const query = parse(transactionQuerySchema, req.query, 'query');
    res.json(await listTransactions(ctxOf(req), query));
  });

  api.post('/transactions', async (req, res) => {
    const input = parse(createTransactionSchema, req.body);
    const created = await createTransaction(ctxOf(req), input);
    res.status(201).json({ items: created });
  });

  api.get('/transactions/:id', async (req, res) => {
    res.json(await getTransaction(ctxOf(req), req.params.id));
  });

  api.patch('/transactions/:id', async (req, res) => {
    const input = parse(updateTransactionSchema, req.body);
    res.json({ items: await updateTransaction(ctxOf(req), req.params.id, input) });
  });

  api.delete('/transactions/:id', async (req, res) => {
    await deleteTransaction(ctxOf(req), req.params.id, isConfirmed(req));
    res.status(204).end();
  });

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
    const redirectUri = loopbackRedirectUri(req.socket.remoteAddress, req.get('host'), req.socket.localPort);
    if (!redirectUri) {
      throw new AppError(
        'SYNC_NEEDS_LOCAL_BROWSER',
        400,
        'Sync signs in through a browser on the computer running myTickrs. Open myTickrs there to sync.',
      );
    }
    const input = parse(startCloudSyncSchema, req.body);
    res.status(201).json(sync.start(ctxOf(req), input, redirectUri));
  });

  api.get('/cloud-sync/callback', async (req, res) => {
    const q = (name: string) => (typeof req.query[name] === 'string' ? req.query[name] : undefined);
    res.setHeader('Content-Security-Policy', CALLBACK_PAGE_CSP);
    if (options.importAi?.signIn?.owns(q('state'))) {
      const page = await options.importAi.signIn.complete({
        state: q('state'),
        code: q('code'),
        error: q('error'),
        errorDescription: q('error_description'),
      });
      res.type('html').send(page);
      return;
    }
    const sync = syncOf(req);
    try {
      const session = await sync.complete({
        state: q('state'),
        code: q('code'),
        error: q('error'),
        errorDescription: q('error_description'),
      });
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

  const importBody = express.json({ type: IMPORT_MEDIA_TYPE, limit: IMPORT_MAX_REQUEST_BYTES });
  const importAi = options.importAi;

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

  api.post('/import/ai/sign-in', (req, res) => {
    requireFeature(ctxOf(req), 'ai-import');
    if (!importAi?.signIn)
      throw new AppError('IMPORT_UNAVAILABLE', 503, 'There is nothing to sign in to here');
    const redirectUri = loopbackRedirectUri(req.socket.remoteAddress, req.get('host'), req.socket.localPort);
    if (!redirectUri) {
      throw new AppError(
        'SYNC_NEEDS_LOCAL_BROWSER',
        400,
        'Signing in uses a browser on the computer running myTickrs. Open myTickrs there to sign in.',
      );
    }
    const { provider } = parse(aiSignInSchema, req.body);
    res.status(201).json(importAi.signIn.start(provider, redirectUri));
  });

  api.delete('/import/ai/sign-in', (req, res) => {
    importAi?.signIn?.signOut();
    res.status(204).end();
  });

  api.get('/fx/rate', async (req, res) => {
    const from = String(req.query.from ?? '');
    const to = String(req.query.to ?? '');
    const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));
    if (!from || !to) throw new AppError('VALIDATION_FAILED', 422, 'from and to are required');
    res.json(await getFxRate(ctxOf(req), from, to, date));
  });

  api.get('/portfolio/summary', async (req, res) => {
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
    res.json(await getPortfolioSummary(ctxOf(req), accountId));
  });

  api.get('/portfolio/holdings', async (req, res) => {
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
    res.json(await getHoldings(ctxOf(req), accountId));
  });

  api.get('/portfolio/holdings/by-account', async (req, res) => {
    res.json(await getHoldingsByAccount(ctxOf(req)));
  });

  api.get('/portfolio/performance', async (req, res) => {
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
    const range = RANGES.includes(req.query.range as Range) ? (req.query.range as Range) : '1Y';
    const benchmark = typeof req.query.benchmark === 'string' ? req.query.benchmark.toUpperCase() : undefined;
    res.json(await getPerformance(ctxOf(req), { accountId, range, benchmark }));
  });

  api.get('/stocks/:symbol/chart', async (req, res) => {
    const range = RANGES.includes(req.query.range as Range) ? (req.query.range as Range) : '1Y';
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
    res.json(await getStockChart(ctxOf(req), req.params.symbol, { range, accountId }));
  });

  api.get('/options/positions', async (req, res) => {
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
    res.json(
      req.query.status === 'closed'
        ? await getClosedOptionPositions(ctxOf(req), accountId)
        : await getOptionPositions(ctxOf(req), { accountId }),
    );
  });

  api.delete('/options/positions/:contractId', async (req, res) => {
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
    await deleteOptionPosition(ctxOf(req), req.params.contractId, { accountId, confirmed: isConfirmed(req) });
    res.status(204).end();
  });

  api.get('/options/expirations', async (req, res) => {
    const withinDays = req.query.withinDays ? Number(req.query.withinDays) : 7;
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
    res.json(await getExpirations(ctxOf(req), withinDays, accountId));
  });

  api.get('/options/needs-action', async (req, res) => {
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
    res.json(await getNeedsAction(ctxOf(req), accountId));
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
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
    res.json(await getOptionIncome(ctxOf(req), accountId));
  });

  api.get('/options/contracts/parse', async (req, res) => {
    const symbol = String(req.query.symbol ?? req.query.occ ?? '');
    const currency = typeof req.query.currency === 'string' ? req.query.currency.toUpperCase() : undefined;
    res.json(await parseContractSymbol(ctxOf(req), symbol, currency));
  });

  api.get('/options/contracts/terms', async (req, res) => {
    const text = (name: string) =>
      typeof req.query[name] === 'string' ? (req.query[name] as string) : undefined;
    const right = text('right');
    res.json(
      await lookupContractTerms(ctxOf(req), {
        underlying: text('underlying') ?? '',
        expiration: text('expiration'),
        strike: text('strike'),
        right: right === 'CALL' || right === 'PUT' ? right : undefined,
        currency: text('currency')?.toUpperCase(),
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

  api.get('/market-data/status', async (req, res) => {
    res.json(await getMarketDataStatus(ctxOf(req)));
  });

  api.post('/market-data/refresh', async (req, res) => {
    res.json(await refreshPortfolioData(ctxOf(req)));
  });

  api.get('/securities/search', async (req, res) => {
    const query = String(req.query.q ?? '').trim();
    if (query.length < 1) return res.json({ source: 'local', items: [] });
    res.json(await searchSymbols(ctxOf(req), query));
  });

  api.get('/securities/:symbol', async (req, res) => {
    const ledgerCtx = await loadLedgerContext(ctxOf(req).data);
    const symbol = req.params.symbol.toUpperCase();
    const security = await ctxOf(req).data.securities.find(symbol);
    if (!security) throw new AppError('NOT_FOUND', 404, 'No such security');
    res.json({ ...security, transactionCount: ledgerCtx.rows.filter((r) => r.symbol === symbol).length });
  });

  return api;
}
