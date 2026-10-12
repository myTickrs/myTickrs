import { dec } from '@tickrs/core';
import {
  parseOptionSymbol,
  type ExtractedInstrument,
  type ImportDraft,
  type ImportSource,
  type SourceRow,
} from '@tickrs/shared';
import { parseDate, parseNumber, parseRight } from './values.js';

export const emptyDraft = (): ImportDraft => ({
  symbol: null,
  expiration: null,
  strike: null,
  right: null,
  quantity: null,
  price: null,
  realizedPnl: null,
  unrealizedPnl: null,
  marketValue: null,
  currency: null,
});

export interface RowParts {
  draft?: Partial<ImportDraft>;
  unread?: boolean;
  description?: string;
  confidence?: 'high' | 'low';
  note?: string | null;
}

export function sourceRow(id: string, source: ImportSource, parts: RowParts): SourceRow {
  return {
    id,
    draft: { ...emptyDraft(), ...parts.draft },
    unread: parts.unread ?? false,
    description: (parts.description ?? '').slice(0, 1000),
    source,
    confidence: parts.confidence ?? 'high',
    note: parts.note?.slice(0, 500) ?? null,
  };
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isoOrNull = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (ISO_DATE.test(trimmed)) return trimmed;
  return parseDate(trimmed, 'MDY');
};

export function instrumentDraft(instrument: Partial<ExtractedInstrument>): Partial<ImportDraft> & {
  isOption: boolean;
} {
  const occ = instrument.occSymbol ? parseOptionSymbol(instrument.occSymbol) : null;
  if (occ) {
    return {
      isOption: true,
      symbol: occ.underlying,
      expiration: occ.expiration,
      strike: occ.strike,
      right: occ.right,
    };
  }
  const expiration = isoOrNull(instrument.expiration);
  const strike = parseNumber(instrument.strike ?? null);
  const right = instrument.right ?? parseRight(null);
  const underlying = (instrument.underlying ?? instrument.symbol)?.trim().toUpperCase() || null;
  if (expiration || strike || right) {
    return {
      isOption: true,
      symbol: underlying,
      expiration,
      strike: strike?.replace(/^-/, '') ?? null,
      right: right ?? null,
    };
  }
  const fromSymbol = instrument.symbol ? parseOptionSymbol(instrument.symbol) : null;
  if (fromSymbol) {
    return {
      isOption: true,
      symbol: fromSymbol.underlying,
      expiration: fromSymbol.expiration,
      strike: fromSymbol.strike,
      right: fromSymbol.right,
    };
  }
  return { isOption: false, symbol: instrument.symbol?.trim().toUpperCase() || null };
}

export const positiveOf = (raw: string | null | undefined): string | null =>
  parseNumber(raw)?.replace(/^-/, '') ?? null;

const OPTION_MULTIPLIER = 100;

export function averageFromCost(
  costBasis: string | null,
  quantity: string | null,
  isOption: boolean,
): string | null {
  if (!costBasis || !quantity) return null;
  try {
    const shares = dec(quantity)
      .abs()
      .times(isOption ? OPTION_MULTIPLIER : 1);
    if (shares.isZero()) return null;
    return dec(costBasis).abs().div(shares).toDecimalPlaces(6).toFixed();
  } catch {
    return null;
  }
}

export function averageFromPnl(draft: ImportDraft, isOption: boolean): string | null {
  if (!draft.marketValue || !draft.unrealizedPnl || !draft.quantity) return null;
  try {
    const value = dec(draft.marketValue).abs();
    const unrealized = dec(draft.unrealizedPnl);
    const short = dec(draft.quantity).isNegative();
    const cost = short ? value.plus(unrealized) : value.minus(unrealized);
    if (cost.isNegative()) return null;
    return averageFromCost(cost.toFixed(), draft.quantity, isOption);
  } catch {
    return null;
  }
}
