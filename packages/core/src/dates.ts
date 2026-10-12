import type { IsoDate } from './types.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function toUtcMs(date: IsoDate): number {
  if (!isIsoDate(date)) throw new TypeError(`Not an ISO date: "${date}"`);
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtcMs(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function* eachDay(from: IsoDate, to: IsoDate): Generator<IsoDate> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}
