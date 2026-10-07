import { FX_HISTORY_BASE, FX_HISTORY_URL, fxUrlFor, parseFxResponse, type FxRateRow } from '@tickrs/shared';
import { fetchJson } from '@tickrs/market-data';
import type { Logger } from 'pino';
import { createContext, type Principal } from '../context.js';
import type { IsoDate } from '../model.js';
import type { Store, StoreTx } from '../store/ports.js';
import { loadCurrencies } from './currencies.js';
import type { CryptoConfig } from './providers.js';

export const FX_HISTORY_DAYS = 400;
const DAY_MS = 86_400_000;
const SOURCE = 'frankfurter';

const addDays = (date: IsoDate, days: number): IsoDate =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export interface FxHistoryDeps {
  store: Store;
  crypto: CryptoConfig;
  principals(): Promise<readonly Principal[]>;
  logger?: Logger;
  now?: () => number;
}

export async function syncFxHistory(deps: FxHistoryDeps) {
  const { store, crypto, logger } = deps;
  const today = new Date(deps.now?.() ?? Date.now()).toISOString().slice(0, 10);
  const saved: string[] = [];
  const failed: string[] = [];

  const codes = new Set<string>();
  let data: StoreTx | undefined;
  try {
    for (const principal of await deps.principals()) {
      const ctx = createContext({ store, crypto, principal });
      try {
        for (const c of await loadCurrencies(ctx.data)) codes.add(c.code);
        data ??= ctx.data;
      } catch (err) {
        logger?.warn({ err, userId: principal.userId }, 'Could not read a user’s currencies for FX history');
      }
    }
  } catch (err) {
    logger?.warn({ err }, 'Could not list the users for the FX history sync');
  }
  if (!data) return { saved, failed };
  codes.delete(FX_HISTORY_BASE);

  for (const quote of [...codes].toSorted()) {
    const key = `${FX_HISTORY_BASE}/${quote}`;
    let from: IsoDate;
    try {
      const coverage = await data.fx.coverage(FX_HISTORY_BASE, quote);
      const last = coverage?.last ? String(coverage.last).slice(0, 10) : null;
      from = last ? addDays(last, 1) : addDays(today, -FX_HISTORY_DAYS);
    } catch (err) {
      logger?.warn({ err, pair: key }, 'Could not read stored FX history');
      failed.push(key);
      continue;
    }
    if (from > today) continue;
    let rows: FxRateRow[];
    try {
      const body = await fetchJson<unknown>(
        SOURCE,
        fxUrlFor(FX_HISTORY_URL, FX_HISTORY_BASE, quote, from, today),
      );
      rows = parseFxResponse(body, FX_HISTORY_BASE, quote).filter((r) => r.date >= from && r.date <= today);
    } catch (err) {
      logger?.info({ pair: key, from, err: (err as Error).message }, 'No new FX history');
      failed.push(key);
      continue;
    }
    try {
      if (rows.length > 0) await data.fx.upsertRates(rows.map((r) => ({ ...r, source: SOURCE })));
      saved.push(key);
    } catch (err) {
      logger?.warn({ err, pair: key }, 'Could not store FX history');
      failed.push(key);
    }
  }
  if (saved.length > 0) logger?.info({ pairs: saved }, 'FX history stored');
  return { saved, failed };
}

export function msUntilUtcMidnight(now: number): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime() - now;
}

export function startDailyFxSync(deps: FxHistoryDeps): () => void {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await syncFxHistory(deps);
    } finally {
      running = false;
    }
  };
  let interval: ReturnType<typeof setInterval> | undefined;
  void run();
  const first = setTimeout(
    () => {
      void run();
      interval = setInterval(() => void run(), DAY_MS);
      interval.unref?.();
    },
    msUntilUtcMidnight(deps.now?.() ?? Date.now()),
  );
  first.unref?.();
  return () => {
    clearTimeout(first);
    if (interval) clearInterval(interval);
  };
}
