import type { DateFormat, OptionRight } from '@tickrs/shared';

export function parseNumber(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let text = raw.trim();
  if (text === '' || text === '-' || text === '--' || text.toLowerCase() === 'n/a') return null;

  const negative = /^\(.*\)$/.test(text) || text.startsWith('-') || /^[^\d(]*-/.test(text);
  text = text.replace(/^\(|\)$/g, '').replace(/^[+-]/, '');

  const scaled = /^([\d.,]+)\s*([km])$/i.exec(text.replace(/[^\d.,km]/gi, ''));
  if (scaled) {
    const base = parseNumber(scaled[1]);
    if (base == null) return null;
    const value = scaleDecimal(base, scaled[2]!.toLowerCase() === 'k' ? 3 : 6);
    return negative ? `-${value}` : value;
  }
  text = text.replace(/[^\d.,]/g, '');
  if (text === '') return null;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (lastComma !== -1) {
    text = /,\d{3}$/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.');
  }
  if (!/^\d*\.?\d*$/.test(text) || text === '.' || text === '') return null;
  const value = negative ? `-${text}` : text;
  return Number.isFinite(Number(value)) ? value : null;
}

function scaleDecimal(value: string, places: number): string {
  const [whole, fraction = ''] = value.split('.');
  const digits = `${whole}${fraction.padEnd(places, '0')}`;
  const point = whole!.length + places;
  const result = `${digits.slice(0, point)}${point < digits.length ? `.${digits.slice(point)}` : ''}`;
  return result.replace(/^0+(?=\d)/, '');
}

export function parseQuantity(raw: string | null | undefined): string | null {
  const value = parseNumber(raw);
  return value == null ? null : value.replace(/^-/, '');
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

interface DateParts {
  a: number;
  b: number;
  year: number;
}

function splitDate(
  raw: string,
): { iso?: string; parts?: DateParts; month?: number; day?: number; year?: number } | null {
  const text = raw
    .trim()
    .replace(/[T ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(am|pm|z|[+-]\d{2}:?\d{2})?$/i, '')
    .trim();
  if (!text) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) return { iso: `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}` };

  const named =
    /^(\d{1,2})[ \-/]*([a-z]{3,})[ \-/,]*(\d{2,4})$|^([a-z]{3,})[ \-/]*(\d{1,2})[ \-/,]*(\d{2,4})$/i.exec(
      text,
    );
  if (named) {
    const month = MONTHS[(named[2] ?? named[4] ?? '').slice(0, 3).toLowerCase()];
    const day = Number(named[1] ?? named[5]);
    const year = Number(named[3] ?? named[6]);
    if (month && day) return { month, day, year: year < 100 ? 2000 + year : year };
    return null;
  }

  const numeric = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(text);
  if (numeric) {
    const year = Number(numeric[3]);
    return { parts: { a: Number(numeric[1]), b: Number(numeric[2]), year: year < 100 ? 2000 + year : year } };
  }
  return null;
}

const valid = (year: number, month: number, day: number): boolean => {
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 2200) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const format = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function detectDateFormat(cells: readonly (string | null | undefined)[]): {
  format: Exclude<DateFormat, 'AUTO'>;
  ambiguous: boolean;
} {
  let sawNumeric = false;
  for (const cell of cells) {
    if (!cell) continue;
    const split = splitDate(cell);
    if (!split?.parts) continue;
    sawNumeric = true;
    if (split.parts.a > 12) return { format: 'DMY', ambiguous: false };
    if (split.parts.b > 12) return { format: 'MDY', ambiguous: false };
  }
  return { format: sawNumeric ? 'MDY' : 'ISO', ambiguous: sawNumeric };
}

export function parseDate(
  raw: string | null | undefined,
  dateFormat: Exclude<DateFormat, 'AUTO'>,
): string | null {
  if (!raw) return null;
  const split = splitDate(raw);
  if (!split) return null;
  if (split.iso) return split.iso;
  if (split.month && split.day && split.year) {
    return valid(split.year, split.month, split.day) ? format(split.year, split.month, split.day) : null;
  }
  if (!split.parts) return null;

  const { a, b, year } = split.parts;
  const dayFirst = a > 12 ? true : b > 12 ? false : dateFormat === 'DMY';
  const [month, day] = dayFirst ? [b, a] : [a, b];
  return valid(year, month, day) ? format(year, month, day) : null;
}

export function parseRight(raw: string | null | undefined): OptionRight | null {
  const text = (raw ?? '').trim().toLowerCase();
  if (text === 'c' || text.startsWith('call')) return 'CALL';
  if (text === 'p' || text.startsWith('put')) return 'PUT';
  return null;
}
