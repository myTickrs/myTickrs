import type { Capabilities, FeeScheduleRequest, FeeScheduleResponse, MarketDef } from '@tickrs/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  api,
  type Account,
  type CurrencyList,
  type MarketItem,
  type MarketProviderRow,
  type ProvidersResponse,
  type Settings,
} from '../api.js';
import { keys, seg } from './keys.js';

export const useCapabilities = () =>
  useQuery({
    queryKey: keys.capabilities,
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

export interface AccountInput {
  name: string;
  broker: string | null;
  currency: string;
}

export async function addAccounts(items: AccountInput[]) {
  const known = (await api.get<CurrencyList>('/currencies')).items.map((c) => c.code);
  for (const code of new Set(items.map((v) => v.currency)))
    if (!known.includes(code)) await api.post<unknown>('/currencies', { code });
  return api.post<{ items: Account[] }>('/accounts/batch', { items });
}

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

const feeScheduleQuery = (accountId: string) => ({
  queryKey: keys.feeSchedule(accountId),
  queryFn: () => api.get<FeeScheduleResponse>(`/accounts/${seg(accountId)}/fee-schedule`),
});

export const useFeeSchedule = (accountId: string | undefined) =>
  useQuery({ enabled: Boolean(accountId), ...feeScheduleQuery(accountId ?? '') });

export const useFeeSchedules = (accountIds: readonly string[]) =>
  useQueries({ queries: accountIds.map(feeScheduleQuery) });

export const patchSettings = (patch: Partial<Settings>) => api.patch<Settings>('/settings', patch);

export const addCurrency = (input: { code: string; name?: string }) =>
  api.post<{ code: string; name: string }>('/currencies', input);
export const removeCurrency = (code: string) => api.delete<void>(`/currencies/${seg(code)}`);

export const updateAccount = (id: string, values: AccountInput) =>
  api.patch<Account>(`/accounts/${seg(id)}`, values);
export const deleteAccount = (id: string) => api.delete<void>(`/accounts/${seg(id)}?confirm=true`);
export const saveFeeSchedule = (accountId: string, body: FeeScheduleRequest) =>
  api.put<FeeScheduleResponse>(`/accounts/${seg(accountId)}/fee-schedule`, body);

export const saveProviderKey = (provider: string, market: string, apiKey: string) =>
  api.put<{ status: string; message: string }>(`/settings/providers/${seg(provider)}/keys/${seg(market)}`, {
    apiKey,
  });
export const removeProviderKey = (provider: string, market: string) =>
  api.delete<void>(`/settings/providers/${seg(provider)}/keys/${seg(market)}`);
export const saveMarketProviders = (market: string, rows: Omit<MarketProviderRow, 'market'>[]) =>
  api.put<ProvidersResponse>(`/settings/market-providers/${seg(market)}`, { rows });
export const resetMarketProviders = (market: string) =>
  api.delete<void>(`/settings/market-providers/${seg(market)}`);

export const saveMarket = (code: string | null, market: MarketDef) =>
  code
    ? api.put<MarketDef>(`/settings/markets/${seg(code)}`, market)
    : api.post<MarketDef>('/settings/markets', market);
export const deleteMarket = (code: string) => api.delete<void>(`/settings/markets/${seg(code)}`);
export const publicHolidays = (country: string, years: readonly number[]) =>
  api.get<{ items: { date: string; name: string }[] }>(
    `/settings/markets/holidays/${seg(country)}?years=${years.join(',')}`,
  );
