import {
  type Capabilities,
  type CloudSyncSession,
  type CloudSyncSettings,
  type StartCloudSyncInput,
  type SyncDirection,
  type CommitRequest,
  type CommitResult,
  type ExtractResponse,
  type ImportConfig,
  type ImportFile,
  type Mapping,
  type ReviewResponse,
  type SourceRow,
} from '@tickrs/shared';
import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  api,
  type Account,
  type CurrencyList,
  type FeeBreakdown,
  type NeedsActionItem,
  type OptionPosition,
  type Paged,
  type MarketItem,
  type ProvidersResponse,
  type SecurityMatch,
  type Settings,
  type StockHolding,
  type Transaction,
} from './api.js';

export const keys = {
  markets: ['settings', 'markets'] as const,
  settings: ['settings'] as const,
  accounts: ['accounts'] as const,
  currencies: ['currencies'] as const,
  summary: (accountId?: string) => ['portfolio', 'summary', accountId ?? 'all'] as const,
  holdings: (accountId?: string) => ['portfolio', 'holdings', accountId ?? 'all'] as const,
  holdingsByAccount: ['portfolio', 'holdings-by-account'] as const,
  transactions: (query: string) => ['transactions', query] as const,
  optionPositions: (accountId?: string) => ['options', 'positions', accountId ?? 'all'] as const,
  needsAction: ['options', 'needs-action'] as const,
  optionIncome: ['options', 'income'] as const,
  optionHistory: ['options', 'history'] as const,
  providers: ['settings', 'providers'] as const,
  feeSchedule: (accountId: string) => ['fee-schedule', accountId] as const,
  securitySearch: (term: string) => ['securities', 'search', term] as const,
};

export const useCapabilities = () =>
  useQuery({
    queryKey: ['capabilities'],
    queryFn: () => api.get<Capabilities>('/capabilities'),
    staleTime: Infinity,
    refetchInterval: false,
  });

export const useSettings = () =>
  useQuery({ queryKey: keys.settings, queryFn: () => api.get<Settings>('/settings') });

export const useCurrencies = () =>
  useQuery({ queryKey: keys.currencies, queryFn: () => api.get<CurrencyList>('/currencies') });

export const useAccounts = () =>
  useQuery({ queryKey: keys.accounts, queryFn: () => api.get<{ items: Account[] }>('/accounts') });

export async function addAccounts(items: { name: string; broker: string | null; currency: string }[]) {
  const known = (await api.get<CurrencyList>('/currencies')).items.map((c) => c.code);
  for (const code of new Set(items.map((v) => v.currency)))
    if (!known.includes(code)) await api.post<unknown>('/currencies', { code });
  return api.post<{ items: Account[] }>('/accounts/batch', { items });
}

export interface PortfolioSummary {
  baseCurrency: string;
  asOf: string;
  marketValue: string;
  positionsValue: string;
  netContributions: string;
  optionPnl: { allTime: string; year: string; month: string; open: string };
  totalReturn: { allTime: string; year: string };
  dayChange: { amount: string; percent: string | null };
  totals: {
    unrealizedStock: string;
    unrealizedOption: string;
    realizedStock: string;
    realizedOption: string;
    dividends: string;
    totalReturn: string;
  };
  counts: { accounts: number; stocks: number; options: number; needsAction: number; expiringSoon: number };
  hasEstimatedValues: boolean;
}

export const useSummary = (accountId?: string) =>
  useQuery({
    queryKey: keys.summary(accountId),
    queryFn: () =>
      api.get<PortfolioSummary>(`/portfolio/summary${accountId ? `?accountId=${accountId}` : ''}`),
  });

type PlChange = { amount: string; percent: string | null };

export interface HoldingsResponse {
  baseCurrency: string;
  marketValue: string;
  stocks: (StockHolding & { weight: string; totalPl: PlChange })[];
  options: (OptionPosition & {
    marketValueBase: string;
    weight: string;
    realized: string;
    totalPl: PlChange;
  })[];
  closedStocks: {
    symbol: string;
    currency: string;
    realized: string;
    dividends: string;
    totalPl: PlChange;
    fxRate: string;
  }[];
  hasEstimatedValues: boolean;
}

export const useHoldings = (accountId?: string) =>
  useQuery({
    queryKey: keys.holdings(accountId),
    queryFn: () =>
      api.get<HoldingsResponse>(`/portfolio/holdings${accountId ? `?accountId=${accountId}` : ''}`),
  });

export interface AccountHolding {
  accountId: string;
  accountName: string;
  currency: string;
  marketValue: string;
  positionsValue: string;
  positionCount: number;
  closedCount: number;
  weight: string;
  realized: string;
  unrealized: string;
}

export interface HoldingsByAccountResponse {
  baseCurrency: string;
  marketValue: string;
  accounts: AccountHolding[];
  hasEstimatedValues: boolean;
}

export const useHoldingsByAccount = (enabled = true) =>
  useQuery({
    enabled,
    queryKey: keys.holdingsByAccount,
    queryFn: () => api.get<HoldingsByAccountResponse>('/portfolio/holdings/by-account'),
  });

export const useTransactions = (query: string) =>
  useQuery({
    queryKey: keys.transactions(query),
    queryFn: () => api.get<Paged<Transaction>>(`/transactions?${query}`),
  });

export const useOptionPositions = (accountId?: string) =>
  useQuery({
    queryKey: keys.optionPositions(accountId),
    queryFn: () =>
      api.get<{ baseCurrency: string; asOf: string; items: OptionPosition[] }>(
        `/options/positions${accountId ? `?accountId=${accountId}` : ''}`,
      ),
  });

export const useNeedsAction = () =>
  useQuery({
    queryKey: keys.needsAction,
    queryFn: () => api.get<{ asOf: string; items: NeedsActionItem[] }>('/options/needs-action'),
  });

export interface OptionIncome {
  baseCurrency: string;
  months: { month: string; realized: string; closed: number; winRate: string | null }[];
  byUnderlying: Record<string, { realized: string; currency: string }>;
  openPremium: string;
}

export const useOptionIncome = () =>
  useQuery({ queryKey: keys.optionIncome, queryFn: () => api.get<OptionIncome>('/options/income') });

export interface OptionHistoryItem {
  txnId: string;
  date: string;
  outcome: 'CLOSED' | 'ROLLED' | 'EXPIRED' | 'ASSIGNED' | 'EXERCISED';
  contractId: string;
  contract: string;
  underlying: string;
  expiration: string;
  strike: string;
  right: 'CALL' | 'PUT';
  side: 'LONG' | 'SHORT' | null;
  contracts: string | null;
  account: { id: string; name: string } | null;
  currency: string;
  amount: string;
  rolledIntoStock: boolean;
  transactions: Transaction[];
}

export const useOptionHistory = (enabled = true) =>
  useQuery({
    queryKey: keys.optionHistory,
    enabled,
    queryFn: () =>
      api.get<{ baseCurrency: string; items: OptionHistoryItem[] }>('/options/positions?status=closed'),
  });

export type Range = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'ALL';

export interface PerformancePoint {
  date: string;
  positionsValue: string;
  marketValue: string;
  netContributions: string;
  externalFlow: string;
  dailyReturn: string | null;
  twrIndex: string;
  estimated: boolean;
  undefinedReturn: boolean;
}

export interface PerformanceResponse {
  baseCurrency: string;
  range: Range;
  from: string;
  to: string;
  points: PerformancePoint[];
  benchmark: { symbol: string; points: { date: string; return: string }[] } | null;
  pendingSymbols: string[];
}

export const usePerformance = (options: { range: Range; accountId?: string; benchmark?: string }) => {
  const params = new URLSearchParams({ range: options.range });
  if (options.accountId) params.set('accountId', options.accountId);
  if (options.benchmark) params.set('benchmark', options.benchmark);
  const query = params.toString();
  return useQuery({
    queryKey: ['portfolio', 'performance', query],
    queryFn: () => api.get<PerformanceResponse>(`/portfolio/performance?${query}`),
  });
};

export interface StockChartResponse {
  symbol: string;
  name: string;
  currency: string;
  range: Range;
  bars: { date: string; open: string | null; high: string | null; low: string | null; close: string }[];
  markers: {
    transactionId: string;
    date: string;
    kind: 'BUY' | 'SELL' | 'OPTION';
    type: string;
    label: string;
    price: string | null;
    quantity: string | null;
    value: string | null;
    currency: string;
    isSystemGenerated: boolean;
    accountId: string;
    accountName: string;
  }[];
  strikes: { contractId: string; price: string; label: string; expiration: string; side: 'LONG' | 'SHORT' }[];
  quote: {
    price: string;
    date: string;
    previousClose: string | null;
    change: string | null;
    changePct: string | null;
    open: string | null;
    high: string | null;
    low: string | null;
    estimated: boolean;
  } | null;
  position: {
    shares: string;
    side: 'LONG' | 'SHORT' | null;
    averagePrice: string | null;
    realized: string;
    dividends: string;
    shortCosts: string;
    dayChange: string | null;
  } | null;
  pendingHistory: boolean;
}

export const useStockChart = (symbol: string, range: Range) =>
  useQuery({
    enabled: Boolean(symbol),
    queryKey: ['stocks', symbol, 'chart', range],
    queryFn: () => api.get<StockChartResponse>(`/stocks/${encodeURIComponent(symbol)}/chart?range=${range}`),
  });

export const useProviders = () =>
  useQuery({
    queryKey: keys.providers,
    queryFn: () => api.get<ProvidersResponse>('/settings/providers'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

export const useMarkets = (enabled = true) =>
  useQuery({
    enabled,
    queryKey: keys.markets,
    queryFn: () => api.get<{ items: MarketItem[] }>('/settings/markets'),
  });

export const useFeeSchedule = (accountId: string | undefined) =>
  useQuery({
    enabled: Boolean(accountId),
    queryKey: keys.feeSchedule(accountId ?? ''),
    queryFn: () => api.get<Record<string, string | null> | null>(`/accounts/${accountId}/fee-schedule`),
  });

export const invalidateLedger = (client: QueryClient) =>
  Promise.all([
    client.invalidateQueries({ queryKey: ['portfolio'] }),
    client.invalidateQueries({ queryKey: ['transactions'] }),
    client.invalidateQueries({ queryKey: ['options'] }),
    client.invalidateQueries({ queryKey: ['stocks'] }),
  ]);

export function useLedgerMutation<TVariables, TData>(fn: (vars: TVariables) => Promise<TData>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await invalidateLedger(client);
    },
  });
}

export const quoteFee = (body: {
  accountId: string;
  type: string;
  quantity: string;
  price: string;
  optionContractId?: string;
}) => api.post<FeeBreakdown>('/fees/quote', body);

export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

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

export const useCloudSyncSettings = () =>
  useQuery({
    queryKey: ['cloud-sync'],
    queryFn: () => api.get<CloudSyncSettings>('/cloud-sync'),
    staleTime: Infinity,
  });

export const useStartCloudSync = () =>
  useMutation({
    mutationFn: (input: StartCloudSyncInput) => api.post<CloudSyncSession>('/cloud-sync/sessions', input),
  });

export const useCloudSyncSession = (id: string | undefined) =>
  useQuery({
    enabled: Boolean(id),
    queryKey: ['cloud-sync', 'session', id],
    queryFn: () => api.get<CloudSyncSession>(`/cloud-sync/sessions/${id}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return !status || status === 'awaiting-sign-in' || status === 'comparing' || status === 'running'
        ? 2000
        : false;
    },
  });

export const useConfirmCloudSync = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: SyncDirection }) =>
      api.post<CloudSyncSession>(`/cloud-sync/sessions/${id}/confirm`, { direction }),
    onSuccess: (session) => client.setQueryData(['cloud-sync', 'session', session.id], session),
  });
};

export const useCancelCloudSync = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/cloud-sync/sessions/${id}`),
    onSuccess: (_data, id) => client.invalidateQueries({ queryKey: ['cloud-sync', 'session', id] }),
  });
};

export const useImportConfig = (waitingForSignIn = false) =>
  useQuery({
    queryKey: ['import', 'config'],
    queryFn: () => api.get<ImportConfig>('/import/config'),
    refetchInterval: waitingForSignIn ? 2000 : false,
    refetchIntervalInBackground: waitingForSignIn,
    refetchOnWindowFocus: waitingForSignIn ? 'always' : true,
  });

export const startImportSignIn = (provider: string) =>
  api.post<{ authorizeUrl: string }>('/import/ai/sign-in', { provider });

export const useImportSignOut = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>('/import/ai/sign-in'),
    onSuccess: () => client.invalidateQueries({ queryKey: ['import', 'config'] }),
  });
};

export const extractImportFile = (body: {
  file: ImportFile;
  mapping?: Mapping;
  saveMapping?: boolean;
  readWithAi?: boolean;
  locale: string;
}) => api.importPost<ExtractResponse>('/import/extract', body);

export const reviewImport = (body: {
  accountId?: string;
  currency?: string;
  rows: SourceRow[];
  openingDate?: string;
}) => api.importPost<ReviewResponse>('/import/review', body);

export const checkImport = (body: CommitRequest) =>
  api.importPost<{ ok: true; rows: number }>('/import/check', body);

export const useCommitImport = () =>
  useLedgerMutation((body: CommitRequest) => api.importPost<CommitResult>('/import/commit', body));
