import { dec } from '@tickrs/core';
import type { MarketRegistry } from '@tickrs/market-data';
import {
  defaultOptionTerms,
  formatContractKey,
  indexByAlias,
  optionIndex,
  type MarketDef,
  type OccParts,
  type OptionSettlement,
  type OptionStyle,
} from '@tickrs/shared';
import { AppError } from '../errors.js';
import type { OptionContractRow, SecurityRow, StoreTx } from '../store/ports.js';

export interface RequestedTerms {
  multiplier?: string;
  style?: OptionStyle;
  settlement?: OptionSettlement;
}

export function marketForCurrency(registry: MarketRegistry, currency: string): MarketDef | undefined {
  if (registry.home?.currency === currency) return registry.home;
  const found = registry.markets.filter((m) => m.currency === currency);
  return found.length === 1 ? found[0] : undefined;
}

export function resolveUnderlying(
  registry: MarketRegistry,
  written: string,
  accountCurrency: string,
): string {
  const upper = written.trim().toUpperCase();
  if (optionIndex(upper)) return upper;
  const market = marketForCurrency(registry, accountCurrency);
  const countries = market
    ? [market.country]
    : registry.markets.filter((m) => m.currency === accountCurrency).map((m) => m.country);
  const alias = countries.map((c) => indexByAlias(upper.replace(/^\^/, ''), c)).find(Boolean);
  if (alias) return alias.symbol;
  if (!market || registry.split(upper).suffix) return upper;
  return registry.listingIn(upper, market.code);
}

const LABELS: Record<keyof RequestedTerms, string> = {
  multiplier: 'contract size',
  style: 'exercise style',
  settlement: 'settlement',
};

function sameTerm(field: keyof RequestedTerms, a: string, b: string): boolean {
  return field === 'multiplier' ? dec(a).eq(dec(b)) : a === b;
}

export async function ensureOptionContract(
  data: StoreTx,
  registry: MarketRegistry,
  parts: OccParts,
  requested: RequestedTerms = {},
): Promise<OptionContractRow> {
  const market = registry.marketOf(parts.underlying);
  const defaults = defaultOptionTerms(parts.underlying, market?.country);
  if (!defaults) {
    throw new AppError(
      'OPTIONS_NOT_SUPPORTED',
      422,
      market
        ? `Options on ${market.name} listings are not supported yet`
        : `${parts.underlying} is in none of your markets: add its market in Settings → Markets first`,
      { underlying: parts.underlying, market: market?.code ?? null },
    );
  }

  const existing = await data.contracts.findByKey(formatContractKey(parts));
  if (existing) {
    for (const field of ['multiplier', 'style', 'settlement'] as const) {
      const wanted = requested[field];
      if (wanted != null && !sameTerm(field, wanted, existing[field])) {
        throw new AppError(
          'CONTRACT_TERMS_MISMATCH',
          422,
          `This contract is already recorded with a ${LABELS[field]} of ${existing[field]}. If yours differs, change it in the contract's terms.`,
          { field, recorded: existing[field], given: wanted, optionContractId: existing.id },
        );
      }
    }
    return existing;
  }

  const multiplier = requested.multiplier ?? defaults.multiplier;
  if (!multiplier) {
    throw new AppError(
      'CONTRACT_SIZE_REQUIRED',
      422,
      `Enter the contract size: ${market?.name ?? 'this market'} options have no single standard size`,
      { issues: [{ path: 'multiplier', message: 'Enter the number of shares per contract' }] },
    );
  }
  await ensureUnderlying(data, registry, parts.underlying);
  return data.contracts.ensure({
    ...parts,
    multiplier,
    style: requested.style ?? defaults.style,
    settlement: requested.settlement ?? defaults.settlement,
  });
}

export async function ensureUnderlying(
  data: StoreTx,
  registry: MarketRegistry,
  symbol: string,
): Promise<SecurityRow> {
  const existing = await data.securities.find(symbol);
  if (existing) return existing;
  const index = optionIndex(symbol);
  return data.securities.ensure(
    symbol,
    index
      ? { currency: index.currency, name: index.name, type: 'INDEX' }
      : { currency: registry.currencyOf(symbol) },
  );
}
