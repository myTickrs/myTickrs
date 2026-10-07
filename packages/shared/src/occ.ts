import type { OptionRight } from './enums.js';

export interface OccParts {
  underlying: string;
  expiration: string;
  right: OptionRight;
  strike: string;
}

const CANONICAL = /^([A-Z0-9.]{1,6})\s*(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;
const ROOT = String.raw`(\^[A-Z0-9]{1,10}|[A-Z0-9]{1,6}(?:\.[A-Z0-9]{1,3})?)`;
const STRIKE = String.raw`(\d+(?:\.\d+)?)`;
const RIGHT = '(C|P|CALL|PUT)';
const SHORT_FORM = new RegExp(String.raw`^-?${ROOT}\s*(\d{2})(\d{2})(\d{2})([CP])${STRIKE}$`);
const HUMAN_FORM = new RegExp(
  String.raw`^${ROOT}\s+(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s+${STRIKE}\s+${RIGHT}$`,
);
const NAMED_MONTH = new RegExp(
  String.raw`^${ROOT.replace('{1,6}', '{1,6}?')}\s*(\d{1,2})[\s-]?([A-Z]{3})[A-Z]{0,6}[\s-]?(\d{4}|\d{2})\s*(?:${RIGHT}\s*${STRIKE}|${STRIKE}\s*${RIGHT})$`,
);
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function normalizeStrike(s: string): string {
  const [int = '0', frac = ''] = s.split('.');
  const i = int.replace(/^0+(?=\d)/, '');
  const f = frac.replace(/0+$/, '');
  return f ? `${i}.${f}` : i;
}

function strikeFromOcc(digits: string): string {
  return normalizeStrike(`${digits.slice(0, 5)}.${digits.slice(5)}`);
}

export function strikeToOcc(strike: string): string {
  if (!/^\d+(\.\d+)?$/.test(strike)) throw new RangeError(`Invalid strike "${strike}"`);
  const [int = '0', frac = ''] = strike.split('.');
  if (frac.replace(/0+$/, '').length > 3) throw new RangeError(`Strike "${strike}" has more than 3 decimals`);
  const digits = `${int.replace(/^0+(?=\d)/, '')}${frac.padEnd(3, '0').slice(0, 3)}`;
  if (digits.length > 8) throw new RangeError(`Strike "${strike}" is too large for an OCC symbol`);
  return digits.padStart(8, '0');
}

function validDate(yyyy: number, mm: number, dd: number): string | null {
  const iso = `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

const fullYear = (y: string): number => (y.length === 2 ? 2000 + Number(y) : Number(y));
const rightOf = (cp: string): OptionRight => (cp.startsWith('C') ? 'CALL' : 'PUT');

export function parseOptionSymbol(input: string): OccParts | null {
  const s = input.trim().toUpperCase();

  let m = CANONICAL.exec(s) ?? SHORT_FORM.exec(s);
  if (m) {
    const [, root, yy, mm, dd, cp, strikeRaw] = m as unknown as string[] as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const expiration = validDate(2000 + Number(yy), Number(mm), Number(dd));
    if (!expiration) return null;
    const isCanonical = CANONICAL.test(s) && strikeRaw.length === 8 && !strikeRaw.includes('.');
    return {
      underlying: root.trim(),
      expiration,
      right: rightOf(cp),
      strike: isCanonical ? strikeFromOcc(strikeRaw) : normalizeStrike(strikeRaw),
    };
  }

  m = HUMAN_FORM.exec(s);
  if (m) {
    const [, root, mm, dd, yRaw, strikeRaw, cp] = m as unknown as string[] as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const expiration = validDate(fullYear(yRaw), Number(mm), Number(dd));
    if (!expiration) return null;
    return { underlying: root, expiration, right: rightOf(cp), strike: normalizeStrike(strikeRaw) };
  }

  m = NAMED_MONTH.exec(s.replace(/\s+/g, ' '));
  if (m) {
    const [, root, dd, mon, yRaw, cpBefore, strikeAfter, strikeBefore, cpAfter] = m as unknown as (
      string | undefined
    )[];
    const month = MONTHS.indexOf(mon!) + 1;
    if (month === 0) return null;
    const expiration = validDate(fullYear(yRaw!), month, Number(dd));
    if (!expiration) return null;
    return {
      underlying: root!,
      expiration,
      right: rightOf((cpBefore ?? cpAfter)!),
      strike: normalizeStrike((strikeAfter ?? strikeBefore)!),
    };
  }
  return null;
}

export function formatOccSymbol(parts: OccParts): string {
  const [yyyy, mm, dd] = parts.expiration.split('-');
  if (!yyyy || !mm || !dd) throw new RangeError(`Invalid expiration "${parts.expiration}"`);
  const root = parts.underlying.toUpperCase();
  if (root.length < 1 || root.length > 6) throw new RangeError(`Invalid underlying "${parts.underlying}"`);
  return `${root.padEnd(6, ' ')}${yyyy.slice(2)}${mm}${dd}${parts.right === 'CALL' ? 'C' : 'P'}${strikeToOcc(parts.strike)}`;
}

export function describeOption(parts: OccParts): string {
  const d = new Date(`${parts.expiration}T00:00:00Z`);
  const date = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${parts.underlying} ${date} ${parts.strike} ${parts.right === 'CALL' ? 'Call' : 'Put'}`;
}
