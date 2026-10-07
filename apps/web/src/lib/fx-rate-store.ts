import type { FxRateRow } from '@tickrs/shared';

let current: FxRateRow[] = [];

export const currentFxRates = (): readonly FxRateRow[] => current;

export function setFxRates(rows: readonly FxRateRow[]): void {
  current = [...rows];
}
