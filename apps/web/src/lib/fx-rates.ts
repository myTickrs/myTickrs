import { DEFAULT_FX_RATE_URL, fxUrlFor, parseFxResponse, type FxRateRow } from '@tickrs/shared';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, type CurrencyList } from './api.js';
import { currentFxRates, setFxRates } from './fx-rate-store.js';
import { useCurrencies } from './queries.js';

export const FX_SYNC_INTERVAL_MS = 60 * 60_000;

let inFlight: Promise<FxSyncResult> | null = null;

export interface FxSyncResult {
  updated: string[];
  failed: string[];
}

export function syncFxRates(client: QueryClient): Promise<FxSyncResult> {
  inFlight ??= run(client).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(client: QueryClient): Promise<FxSyncResult> {
  const list = await api.get<CurrencyList>('/currencies');
  const quotes = (list.items ?? []).map((c) => c.code).filter((c) => c !== list.baseCurrency);
  const results = await Promise.all(
    quotes.map(async (quote) => {
      try {
        const response = await fetch(fxUrlFor(DEFAULT_FX_RATE_URL, list.baseCurrency, quote));
        if (!response.ok) throw new Error(`Frankfurter responded ${response.status}`);
        return { quote, rows: parseFxResponse(await response.json(), list.baseCurrency, quote) };
      } catch (err) {
        console.warn(`No ${list.baseCurrency}/${quote} rate:`, err);
        return { quote, rows: null };
      }
    }),
  );
  const fetched = results.flatMap((r) => r.rows ?? []);
  const kept = currentFxRates().filter(
    (r: FxRateRow) =>
      r.base === list.baseCurrency && results.some((x) => x.quote === r.quote && x.rows == null),
  );
  setFxRates([...fetched, ...kept]);
  await client.invalidateQueries();
  return {
    updated: results.filter((r) => r.rows).map((r) => r.quote),
    failed: results.filter((r) => !r.rows).map((r) => r.quote),
  };
}

export function useFxRateSync(): void {
  const client = useQueryClient();
  const currencies = useCurrencies();
  const base = currencies.data?.baseCurrency;
  const key = base ? `${base}:${(currencies.data?.items ?? []).map((c) => c.code).join(',')}` : null;

  useEffect(() => {
    if (!key) return;
    const sync = () => void syncFxRates(client).catch((err: unknown) => console.warn('FX sync failed:', err));
    sync();
    const timer = setInterval(sync, FX_SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [client, key]);
}
