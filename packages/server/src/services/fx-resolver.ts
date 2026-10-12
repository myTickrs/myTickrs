import { dec, toFxRateString } from '@tickrs/core';
import { FX_HISTORY_BASE } from '@tickrs/shared';
import type { IsoDate } from '../model.js';
import type { FxRow } from '../store/ports.js';

export interface FxResolver {
  (from: string, to: string, date: IsoDate): string | null;
}

export function buildFxResolver(rows: readonly FxRow[]): FxResolver {
  const direct = new Map<string, { date: IsoDate; rate: string }[]>();
  for (const r of rows) {
    const key = `${r.base}>${r.quote}`;
    const list = direct.get(key) ?? [];
    list.push({ date: r.date, rate: r.rate });
    direct.set(key, list);
  }
  for (const list of direct.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const latest = (key: string, date: IsoDate) => {
    const list = direct.get(key);
    if (!list) return null;
    let found: string | null = null;
    for (const entry of list) {
      if (entry.date > date) break;
      found = entry.rate;
    }
    return found;
  };

  const pair = (from: string, to: string, date: IsoDate) => {
    if (from === to) return dec('1');
    const forward = latest(`${from}>${to}`, date);
    if (forward) return dec(forward);
    const inverse = latest(`${to}>${from}`, date);
    return inverse && !dec(inverse).isZero() ? dec('1').div(dec(inverse)) : null;
  };

  return (from, to, date) => {
    if (from === to) return '1';
    const rate = pair(from, to, date);
    if (rate) return toFxRateString(rate);
    const toPivot = pair(from, FX_HISTORY_BASE, date);
    const fromPivot = toPivot && pair(FX_HISTORY_BASE, to, date);
    return toPivot && fromPivot ? toFxRateString(toPivot.times(fromPivot)) : null;
  };
}
