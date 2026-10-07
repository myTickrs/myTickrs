import type { OptionRight } from './enums.js';
import { normalizeStrike, type OccParts } from './occ.js';

export function formatContractKey(parts: OccParts): string {
  const right = parts.right === 'CALL' ? 'C' : 'P';
  return `${parts.underlying.trim().toUpperCase()}|${parts.expiration}|${right}|${normalizeStrike(parts.strike)}`;
}

export function parseContractKey(key: string): OccParts | null {
  const m = /^([^|]+)\|(\d{4}-\d{2}-\d{2})\|([CP])\|(\d+(?:\.\d+)?)$/.exec(key.trim());
  if (!m) return null;
  const [, underlying, expiration, right, strike] = m as unknown as string[] as [
    string,
    string,
    string,
    string,
    string,
  ];
  return {
    underlying,
    expiration,
    right: (right === 'C' ? 'CALL' : 'PUT') satisfies OptionRight,
    strike: normalizeStrike(strike),
  };
}
