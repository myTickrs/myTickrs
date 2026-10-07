import type { IsoDate } from '@tickrs/core';

export interface MarketHours {
  timezone: string;
  sessions: readonly { open: string; close: string }[];
  weekdays: readonly number[];
  closedDays: readonly string[];
}

export interface MarketClock {
  date(at?: Date): IsoDate;
  isOpen(at?: Date): boolean;
  quoteTtlMs(at?: Date): number;
  holidays(year: number): ReadonlySet<string>;
  isHoliday(date: IsoDate): boolean;
  isTradingDay(date: IsoDate): boolean;
  lastTradingDay(date: IsoDate): IsoDate;
  lastCompletedTradingDay(at?: Date): IsoDate;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatters = new Map<string, Intl.DateTimeFormat>();

function localParts(timezone: string, at: Date) {
  let format = formatters.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timezone, format);
  }
  const parts = format.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    weekday: WEEKDAYS[get('weekday')] ?? 0,
    date: `${get('year')}-${get('month')}-${get('day')}` as IsoDate,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export function isValidTimezone(timezone: string): boolean {
  try {
    return Intl.DateTimeFormat('en-US', { timeZone: timezone }).resolvedOptions().timeZone !== '';
  } catch {
    return false;
  }
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const iso = (utc: Date): IsoDate => utc.toISOString().slice(0, 10) as IsoDate;
const dayOfWeek = (date: IsoDate) => new Date(`${date}T00:00:00Z`).getUTCDay();
const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(date.getUTCDate() + days);
  return next;
};

const clocks = new Map<string, MarketClock>();

export function marketClock(hours: MarketHours): MarketClock {
  const key = JSON.stringify([hours.timezone, hours.sessions, hours.weekdays, hours.closedDays]);
  const cached = clocks.get(key);
  if (cached) return cached;

  const sessions = hours.sessions
    .map((s) => ({ open: toMinutes(s.open), close: toMinutes(s.close) }))
    .toSorted((a, b) => a.open - b.open);
  const closeMinutes = sessions.at(-1)?.close ?? 24 * 60;
  const weekdays = new Set(hours.weekdays);
  const holidayCache = new Map<number, Set<string>>();

  const holidays = (year: number): ReadonlySet<string> => {
    const found = holidayCache.get(year);
    if (found) return found;
    const set = new Set(hours.closedDays.filter((d) => d.startsWith(`${year}-`)));
    holidayCache.set(year, set);
    return set;
  };
  const isHoliday = (date: IsoDate) => holidays(Number(date.slice(0, 4))).has(date);
  const isTradingDay = (date: IsoDate) => weekdays.has(dayOfWeek(date)) && !isHoliday(date);
  const lastTradingDay = (date: IsoDate): IsoDate => {
    const cursor = new Date(`${date}T00:00:00Z`);
    for (let i = 0; i < 15; i++) {
      const candidate = iso(cursor);
      if (isTradingDay(candidate)) return candidate;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return date;
  };
  const isOpen = (at: Date = new Date()) => {
    const { date, minutes } = localParts(hours.timezone, at);
    return isTradingDay(date) && sessions.some((s) => minutes >= s.open && minutes < s.close);
  };

  const clock: MarketClock = {
    date: (at = new Date()) => localParts(hours.timezone, at).date,
    isOpen,
    quoteTtlMs: (at = new Date()) => (isOpen(at) ? 5 * 60_000 : 60 * 60_000),
    holidays,
    isHoliday,
    isTradingDay,
    lastTradingDay,
    lastCompletedTradingDay: (at = new Date()) => {
      const { date, minutes } = localParts(hours.timezone, at);
      if (isTradingDay(date) && minutes < closeMinutes) {
        return lastTradingDay(iso(addDays(new Date(`${date}T00:00:00Z`), -1)));
      }
      return lastTradingDay(date);
    },
  };
  clocks.set(key, clock);
  return clock;
}
