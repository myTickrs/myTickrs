import type {
  ChartRange as Range,
  HoldingsByAccountResponse,
  HoldingsResponse,
  PerformanceResponse,
  PortfolioSummary,
  StockChartResponse,
} from '@tickrs/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, type SecurityMatch, withQuery } from '../api.js';
import { keys, useDebounced } from './keys.js';

export const useSummary = (accountId?: string) =>
  useQuery({
    queryKey: keys.summary(accountId),
    queryFn: () => api.get<PortfolioSummary>(withQuery('/portfolio/summary', { accountId })),
  });

export const useHoldings = (accountId?: string) =>
  useQuery({
    queryKey: keys.holdings(accountId),
    queryFn: () => api.get<HoldingsResponse>(withQuery('/portfolio/holdings', { accountId })),
  });

export const useHoldingsByAccount = (enabled = true) =>
  useQuery({
    enabled,
    queryKey: keys.holdingsByAccount,
    queryFn: () => api.get<HoldingsByAccountResponse>('/portfolio/holdings/by-account'),
  });

export const usePerformance = (options: { range: Range; accountId?: string; benchmark?: string }) => {
  const query = new URLSearchParams({ range: options.range });
  if (options.accountId) query.set('accountId', options.accountId);
  if (options.benchmark) query.set('benchmark', options.benchmark);
  return useQuery({
    queryKey: keys.performance(query.toString()),
    queryFn: () => api.get<PerformanceResponse>(`/portfolio/performance?${query}`),
  });
};

export const useStockChart = (symbol: string, range: Range) =>
  useQuery({
    enabled: Boolean(symbol),
    queryKey: keys.stockChart(symbol, range),
    queryFn: () => api.get<StockChartResponse>(`/stocks/${encodeURIComponent(symbol)}/chart?range=${range}`),
  });

export function useSecuritySearch(text: string, enabled = true) {
  const term = useDebounced(text.trim().toUpperCase(), 300);
  return useQuery({
    enabled: enabled && term.length > 0,
    queryKey: keys.securitySearch(term),
    queryFn: () =>
      api.get<{ source: string; items: SecurityMatch[] }>(`/securities/search?q=${encodeURIComponent(term)}`),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
