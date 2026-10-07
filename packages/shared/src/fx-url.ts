import { z } from 'zod';
import { currencyCode, isoDate, positiveDecimal } from './schemas.js';

export const FX_HISTORY_BASE = 'USD';

export const DEFAULT_FX_RATE_URL = 'https://api.frankfurter.dev/v1/latest?from={base}&to={quote}';
export const FX_HISTORY_URL = 'https://api.frankfurter.dev/v1/{from}..{to}?from={base}&to={quote}';

export interface FxRateRow {
  base: string;
  quote: string;
  date: string;
  rate: string;
}

export function fxUrlFor(template: string, base: string, quote: string, from = '', to = ''): string {
  const values: Record<string, string> = { base, quote, from, to };
  return template.replace(/\{(base|quote|from|to)\}/g, (_, key: string) => encodeURIComponent(values[key]!));
}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function rateOf(value: unknown): string | null {
  const s = typeof value === 'number' ? value.toString() : typeof value === 'string' ? value.trim() : '';
  return /^\d+(\.\d+)?$/.test(s) && /[1-9]/.test(s) ? s : null;
}

export function parseFxResponse(body: unknown, base: string, quote: string): FxRateRow[] {
  const rows: FxRateRow[] = [];
  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const rates = o.rates && typeof o.rates === 'object' ? (o.rates as Record<string, unknown>) : {};
  const add = (date: string, value: unknown) => {
    const rate = rateOf(value);
    if (rate) rows.push({ base, quote, date, rate });
  };
  if (isDate(o.date)) add(o.date, rates[quote]);
  else {
    for (const [date, day] of Object.entries(rates)) {
      if (isDate(date) && day && typeof day === 'object') add(date, (day as Record<string, unknown>)[quote]);
    }
  }
  if (rows.length === 0) throw new Error(`No ${base}/${quote} rate in the FX answer`);
  return rows.toSorted((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export const FX_RATES_HEADER = 'x-fx-rates';

const headerEntry = z.object({
  base: currencyCode,
  quote: currencyCode,
  rate: positiveDecimal,
  date: isoDate,
});

export function formatFxRatesHeader(rows: readonly FxRateRow[]): string {
  return rows.map((r) => `${r.base}/${r.quote}=${r.rate}@${r.date}`).join(';');
}

export function parseFxRatesHeader(value: string): FxRateRow[] {
  const entries = value
    .split(';')
    .map((e) => e.trim())
    .filter(Boolean);
  if (entries.length > 50) throw new Error('At most 50 FX rates per request');
  return entries.map((entry) => {
    const match = /^([^/]+)\/([^=]+)=([^@]+)@(.+)$/.exec(entry);
    if (!match) throw new Error(`Not an FX rate: ${entry}`);
    const parsed = headerEntry.safeParse({ base: match[1], quote: match[2], rate: match[3], date: match[4] });
    if (!parsed.success) throw new Error(`Not an FX rate: ${entry}`);
    return parsed.data;
  });
}
