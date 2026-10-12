import type { Request, Router } from 'express';
import { AppError } from '../errors.js';
import { type CtxOf, queryText } from '../http.js';
import { getFxRate } from '../services/fx.js';
import { getMarketDataStatus, refreshPortfolioData, searchSymbols } from '../services/market-data.js';
import { getPerformance, RANGES, type Range } from '../services/performance.js';
import { getHoldings, getHoldingsByAccount, getPortfolioSummary } from '../services/portfolio.js';
import { getStockChart } from '../services/stock-chart.js';

function queryRange(req: Request): Range {
  const range = queryText(req, 'range') as Range | undefined;
  return range && RANGES.includes(range) ? range : '1Y';
}

export function portfolioRoutes(api: Router, ctxOf: CtxOf): void {
  api.get('/fx/rate', async (req, res) => {
    const ctx = ctxOf(req);
    const from = String(req.query.from ?? '');
    const to = String(req.query.to ?? '');
    const date = String(req.query.date ?? ctx.clock.today());
    if (!from || !to) throw new AppError('VALIDATION_FAILED', 422, 'from and to are required');
    res.json(await getFxRate(ctx, from, to, date));
  });

  api.get('/portfolio/summary', async (req, res) => {
    res.json(await getPortfolioSummary(ctxOf(req), queryText(req, 'accountId')));
  });

  api.get('/portfolio/holdings', async (req, res) => {
    res.json(await getHoldings(ctxOf(req), queryText(req, 'accountId')));
  });

  api.get('/portfolio/holdings/by-account', async (req, res) => {
    res.json(await getHoldingsByAccount(ctxOf(req)));
  });

  api.get('/portfolio/performance', async (req, res) => {
    res.json(
      await getPerformance(ctxOf(req), {
        accountId: queryText(req, 'accountId'),
        range: queryRange(req),
        benchmark: queryText(req, 'benchmark')?.toUpperCase(),
      }),
    );
  });

  api.get('/stocks/:symbol/chart', async (req, res) => {
    res.json(
      await getStockChart(ctxOf(req), req.params.symbol, {
        range: queryRange(req),
        accountId: queryText(req, 'accountId'),
      }),
    );
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
    const { data } = ctxOf(req);
    const symbol = req.params.symbol.toUpperCase();
    const security = await data.securities.find(symbol);
    if (!security) throw new AppError('NOT_FOUND', 404, 'No such security');
    const { total } = await data.transactions.query({
      symbol,
      sort: 'tradeDate',
      direction: 'desc',
      page: 1,
      pageSize: 1,
    });
    res.json({ ...security, transactionCount: total });
  });
}
