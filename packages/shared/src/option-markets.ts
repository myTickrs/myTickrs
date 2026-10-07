import type { OptionSettlement, OptionStyle } from './enums.js';

export interface OptionTerms {
  multiplier: string | null;
  style: OptionStyle;
  settlement: OptionSettlement;
}

export interface OptionMarket {
  country: string;
  exchanges: string;
  equity: OptionTerms;
}

const AMERICAN_100: OptionTerms = { multiplier: '100', style: 'AMERICAN', settlement: 'PHYSICAL' };

export const OPTION_MARKETS: readonly OptionMarket[] = [
  { country: 'US', exchanges: 'Cboe, Nasdaq, NYSE', equity: AMERICAN_100 },
  { country: 'CA', exchanges: 'Montréal Exchange', equity: AMERICAN_100 },
  { country: 'DE', exchanges: 'Eurex', equity: AMERICAN_100 },
  { country: 'FR', exchanges: 'Euronext Paris', equity: AMERICAN_100 },
  { country: 'NL', exchanges: 'Euronext Amsterdam', equity: AMERICAN_100 },
  { country: 'BE', exchanges: 'Euronext Brussels', equity: AMERICAN_100 },
  {
    country: 'GB',
    exchanges: 'ICE Futures Europe',
    equity: { multiplier: '1000', style: 'AMERICAN', settlement: 'PHYSICAL' },
  },
  { country: 'CH', exchanges: 'Eurex', equity: AMERICAN_100 },
  {
    country: 'HK',
    exchanges: 'HKEX',
    equity: { multiplier: null, style: 'AMERICAN', settlement: 'PHYSICAL' },
  },
  {
    country: 'JP',
    exchanges: 'Osaka Exchange',
    equity: { multiplier: '100', style: 'EUROPEAN', settlement: 'PHYSICAL' },
  },
  { country: 'AU', exchanges: 'ASX', equity: AMERICAN_100 },
  {
    country: 'SG',
    exchanges: 'SGX',
    equity: { multiplier: '1000', style: 'AMERICAN', settlement: 'PHYSICAL' },
  },
  {
    country: 'IN',
    exchanges: 'NSE, BSE',
    equity: { multiplier: null, style: 'EUROPEAN', settlement: 'PHYSICAL' },
  },
];

export interface OptionIndex {
  symbol: string;
  country: string;
  name: string;
  currency: string;
  multiplier: string | null;
  aliases: readonly string[];
}

export const OPTION_INDEXES: readonly OptionIndex[] = [
  {
    symbol: '^SPX',
    country: 'US',
    name: 'S&P 500',
    currency: 'USD',
    multiplier: '100',
    aliases: ['SPX', 'SPXW'],
  },
  {
    symbol: '^NDX',
    country: 'US',
    name: 'Nasdaq-100',
    currency: 'USD',
    multiplier: '100',
    aliases: ['NDX', 'NDXP'],
  },
  {
    symbol: '^RUT',
    country: 'US',
    name: 'Russell 2000',
    currency: 'USD',
    multiplier: '100',
    aliases: ['RUT', 'RUTW'],
  },
  {
    symbol: '^TX60',
    country: 'CA',
    name: 'S&P/TSX 60',
    currency: 'CAD',
    multiplier: '100',
    aliases: ['SXO', 'TX60'],
  },
  {
    symbol: '^STOXX50E',
    country: 'DE',
    name: 'EURO STOXX 50',
    currency: 'EUR',
    multiplier: '10',
    aliases: ['OESX', 'SX5E', 'STOXX50E'],
  },
  {
    symbol: '^GDAXI',
    country: 'DE',
    name: 'DAX',
    currency: 'EUR',
    multiplier: '5',
    aliases: ['ODAX', 'DAX', 'GDAXI'],
  },
  {
    symbol: '^FCHI',
    country: 'FR',
    name: 'CAC 40',
    currency: 'EUR',
    multiplier: '10',
    aliases: ['PXA', 'CAC', 'FCHI'],
  },
  { symbol: '^AEX', country: 'NL', name: 'AEX', currency: 'EUR', multiplier: '100', aliases: ['AEX'] },
  {
    symbol: '^FTSE',
    country: 'GB',
    name: 'FTSE 100',
    currency: 'GBP',
    multiplier: '10',
    aliases: ['ESX', 'UKX', 'FTSE'],
  },
  {
    symbol: '^SSMI',
    country: 'CH',
    name: 'SMI',
    currency: 'CHF',
    multiplier: '10',
    aliases: ['OSMI', 'SMI', 'SSMI'],
  },
  { symbol: '^HSI', country: 'HK', name: 'Hang Seng', currency: 'HKD', multiplier: '50', aliases: ['HSI'] },
  {
    symbol: '^N225',
    country: 'JP',
    name: 'Nikkei 225',
    currency: 'JPY',
    multiplier: '1000',
    aliases: ['N225', 'NK225'],
  },
  {
    symbol: '^AXJO',
    country: 'AU',
    name: 'S&P/ASX 200',
    currency: 'AUD',
    multiplier: '10',
    aliases: ['XJO', 'AXJO'],
  },
  {
    symbol: '^NSEI',
    country: 'IN',
    name: 'Nifty 50',
    currency: 'INR',
    multiplier: null,
    aliases: ['NIFTY', 'NSEI'],
  },
  {
    symbol: '^NSEBANK',
    country: 'IN',
    name: 'Nifty Bank',
    currency: 'INR',
    multiplier: null,
    aliases: ['BANKNIFTY', 'NIFTYBANK', 'NSEBANK'],
  },
  {
    symbol: '^BSESN',
    country: 'IN',
    name: 'BSE Sensex',
    currency: 'INR',
    multiplier: null,
    aliases: ['SENSEX', 'BSESN'],
  },
];

export const INDEX_OPTION_TERMS: Omit<OptionTerms, 'multiplier'> = { style: 'EUROPEAN', settlement: 'CASH' };

export function optionMarket(country: string | null | undefined): OptionMarket | undefined {
  return country ? OPTION_MARKETS.find((m) => m.country === country) : undefined;
}

export function optionIndex(symbol: string | null | undefined): OptionIndex | undefined {
  if (!symbol) return undefined;
  const upper = symbol.trim().toUpperCase();
  return OPTION_INDEXES.find((i) => i.symbol === upper);
}

export function indexByAlias(name: string, country: string | null | undefined): OptionIndex | undefined {
  const upper = name.trim().toUpperCase();
  return OPTION_INDEXES.find((i) => i.country === country && i.aliases.includes(upper));
}

export const isIndexSymbol = (symbol: string): boolean => symbol.trim().startsWith('^');

export function defaultOptionTerms(
  underlying: string,
  country: string | null | undefined,
): OptionTerms | undefined {
  const index = optionIndex(underlying);
  if (index) return { multiplier: index.multiplier, ...INDEX_OPTION_TERMS };
  return optionMarket(country)?.equity;
}
