import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from './api.js';

export const QUOTE_REFRESH_INTERVAL_MS = 5 * 60_000;
export const QUOTE_PENDING_RETRY_MS = 60_000;

export interface QuoteRefreshResult {
  refreshed: string[];
  pendingSymbols: string[];
  provider: string | null;
}

export interface OptionQuoteRefreshResult {
  refreshed: string[];
  pending: string[];
  provider: string | null;
}

export interface RefreshResponse {
  quotes: QuoteRefreshResult;
  options?: OptionQuoteRefreshResult;
}

let inFlight: Promise<RefreshResponse> | null = null;

export function refreshQuotes(client: QueryClient): Promise<RefreshResponse> {
  inFlight ??= run(client).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(client: QueryClient): Promise<RefreshResponse> {
  const response = await api.post<RefreshResponse>('/market-data/refresh');
  const { quotes, options } = response;
  if (quotes.refreshed.length > 0 || (options?.refreshed.length ?? 0) > 0) await client.invalidateQueries();
  return response;
}

function worthRetrying({ quotes, options }: RefreshResponse): boolean {
  return (
    (quotes.provider !== null && quotes.pendingSymbols.length > 0) ||
    (options?.provider != null && options.pending.length > 0)
  );
}

export function useQuoteRefresh(): void {
  const client = useQueryClient();

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(retry);
      void refreshQuotes(client)
        .then((response) => {
          if (worthRetrying(response)) retry = setTimeout(refresh, QUOTE_PENDING_RETRY_MS);
        })
        .catch((err: unknown) => console.warn('Quote refresh failed:', err));
    };
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, QUOTE_REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(retry);
    };
  }, [client]);
}
