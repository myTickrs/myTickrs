import { holidayCalendarUrl, type MarketDef } from '@tickrs/shared';
import type { Logger } from 'pino';
import { createContext, type Ctx, type Principal } from '../context.js';
import { AppError } from '../errors.js';
import type { IsoDate } from '../model.js';
import type { Store } from '../store/ports.js';
import { msUntilUtcMidnight } from './fx-history.js';
import { loadMarkets, updateMarket } from './markets.js';
import type { CryptoConfig } from './providers.js';

export interface PublicHoliday {
  date: IsoDate;
  name: string;
}

const SOURCE = 'Google Calendar';
const DAY_MS = 86_400_000;
const CACHE_MS = DAY_MS / 2;

const unescape = (text: string) => text.replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, '\n');
const toIso = (yyyymmdd: string) =>
  `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}` as IsoDate;

const valueOf = (line: string | undefined) => (line ? line.slice(line.indexOf(':') + 1).trim() : '');

export function parsePublicHolidays(ics: string): PublicHoliday[] {
  const text = ics.replace(/\r?\n[ \t]/g, '');
  const found = new Map<string, PublicHoliday>();
  for (const event of text.split('BEGIN:VEVENT').slice(1)) {
    const field = (name: string) => valueOf(new RegExp(`^${name}[;:][^\\r\\n]*`, 'm').exec(event)?.[0]);
    if (!unescape(field('DESCRIPTION')).startsWith('Public holiday')) continue;
    const start = /(\d{8})/.exec(field('DTSTART'))?.[1];
    if (!start) continue;
    const end = /(\d{8})/.exec(field('DTEND'))?.[1];
    const name = unescape(field('SUMMARY'));
    const day = new Date(`${toIso(start)}T00:00:00Z`);
    const last = end ? new Date(`${toIso(end)}T00:00:00Z`).getTime() - DAY_MS : day.getTime();
    for (let i = 0; day.getTime() <= last && i < 31; i++) {
      const date = day.toISOString().slice(0, 10) as IsoDate;
      if (!found.has(date)) found.set(date, { date, name });
      day.setUTCDate(day.getUTCDate() + 1);
    }
  }
  return [...found.values()].toSorted((a, b) => a.date.localeCompare(b.date));
}

async function fetchText(url: string, maxBytes: number, timeoutMs = 15_000): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (!response.ok) throw new Error(`${SOURCE} responded ${response.status}`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error(`${SOURCE} sent more than ${maxBytes} bytes`);
  const text = await response.text();
  if (text.length > maxBytes) throw new Error(`${SOURCE} sent more than ${maxBytes} bytes`);
  return text;
}

const cache = new Map<string, { at: number; holidays: Promise<PublicHoliday[]> }>();

export function resetHolidayCache(): void {
  cache.clear();
}

export function fetchPublicHolidays(country: string, now = Date.now()): Promise<PublicHoliday[]> {
  const url = holidayCalendarUrl(country);
  if (!url) {
    return Promise.reject(
      new AppError('NOT_FOUND', 404, `There is no holiday calendar for ${country}`, { country }),
    );
  }
  const hit = cache.get(country);
  if (hit && now - hit.at < CACHE_MS) return hit.holidays;
  const holidays = fetchText(url, 3_000_000)
    .then(parsePublicHolidays)
    .catch((err: unknown) => {
      cache.delete(country);
      throw new AppError(
        'HOLIDAYS_UNAVAILABLE',
        502,
        `Could not get the holidays for ${country} from Google: ${String(err)}`,
        { country },
      );
    });
  cache.set(country, { at: now, holidays });
  return holidays;
}

export async function listPublicHolidays(country: string, years: readonly number[]) {
  const wanted = new Set(years.map(String));
  const holidays = await fetchPublicHolidays(country);
  return { country, items: holidays.filter((h) => wanted.has(h.date.slice(0, 4))) };
}

export function withHolidays(
  market: MarketDef,
  holidays: readonly PublicHoliday[],
  years: readonly number[],
): MarketDef {
  const wanted = new Set(years.map(String));
  const add = holidays.filter(
    (h) =>
      wanted.has(h.date.slice(0, 4)) && market.weekdays.includes(new Date(`${h.date}T00:00:00Z`).getUTCDay()),
  );
  const covered = years.filter((y) => holidays.some((h) => h.date.startsWith(`${y}-`)));
  if (covered.length === 0) return market;
  return {
    ...market,
    closedDays: [...new Set([...market.closedDays, ...add.map((h) => h.date)])].toSorted(),
    holidaysThrough: Math.max(market.holidaysThrough ?? 0, ...covered),
  };
}

export interface HolidaySyncDeps {
  store: Store;
  crypto: CryptoConfig;
  principals(): Promise<readonly Principal[]>;
  logger?: Logger;
  now?: () => number;
}

export async function syncMarketHolidays(deps: HolidaySyncDeps) {
  const now = deps.now?.() ?? Date.now();
  const target = new Date(now).getUTCFullYear() + 1;
  const updated: string[] = [];
  const failed: string[] = [];
  let principals: readonly Principal[] = [];
  try {
    principals = await deps.principals();
  } catch (err) {
    deps.logger?.warn({ err }, 'Could not list users for the holiday sync');
  }
  for (const principal of principals) {
    const ctx: Ctx = createContext({ store: deps.store, crypto: deps.crypto, principal });
    let markets: MarketDef[];
    try {
      markets = await loadMarkets(ctx.data);
    } catch (err) {
      deps.logger?.warn({ err }, 'Could not read markets for the holiday sync');
      continue;
    }
    for (const market of markets) {
      if (!market.country || !holidayCalendarUrl(market.country)) continue;
      const from = (market.holidaysThrough ?? target - 2) + 1;
      if (from > target) continue;
      const years = Array.from({ length: target - from + 1 }, (_, i) => from + i);
      try {
        const holidays = await fetchPublicHolidays(market.country, now);
        const saved = await updateMarket(ctx, market.code, (m) =>
          m.country === market.country ? withHolidays(m, holidays, years) : m,
        );
        if (saved?.holidaysThrough !== market.holidaysThrough) updated.push(market.code);
      } catch (err) {
        deps.logger?.warn({ err, market: market.code }, 'Could not update market holidays');
        failed.push(market.code);
      }
    }
  }
  if (updated.length > 0) deps.logger?.info({ markets: updated }, 'Market holidays updated');
  return { updated, failed };
}

export function startDailyHolidaySync(deps: HolidaySyncDeps): () => void {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await syncMarketHolidays(deps);
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
