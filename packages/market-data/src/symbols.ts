import { DEFAULT_REGISTRY, type MarketRegistry, type SymbolParts } from './markets.js';

export type { SymbolParts };

export const splitSymbol = (symbol: string): SymbolParts => DEFAULT_REGISTRY.split(symbol);

export const currencyOfSymbol = (symbol: string): string => DEFAULT_REGISTRY.currencyOf(symbol);

export const exchangeOfSymbol = (symbol: string): string | null => DEFAULT_REGISTRY.exchangeOf(symbol);

export const canonicalSymbol = (
  ticker: string,
  exchange?: string | null,
  registry: MarketRegistry = DEFAULT_REGISTRY,
): string => registry.canonical(ticker, exchange);
