export const PLUGIN_API_VERSION = 1;

export type Locale = 'en' | 'de' | 'es' | 'fr' | 'it' | 'ja' | 'ko' | 'zh-CN' | 'zh-TW';

export interface Quote {
  symbol: string;
  price: string;
  change: string | null;
  changePct: string | null;
  open?: string | null;
  high?: string | null;
  low?: string | null;
  previousClose?: string | null;
  asOf: string;
}

export interface PriceBar {
  date: string;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string;
  volume: string | null;
}

export interface CorporateActionInfo {
  symbol: string;
  date: string;
  type: 'SPLIT' | 'DIVIDEND';
  ratioFrom: string | null;
  ratioTo: string | null;
  amount: string | null;
}

export interface ProviderCapabilities {
  search: boolean;
  quotes: boolean;
  history: boolean;
  corporateActions: boolean;
  optionQuotes?: boolean;
}

export interface BatchLimits {
  quotes?: number;
  optionQuotes?: number | 'underlying';
}

export interface ProviderLimits {
  perMinute: number;
  perDay?: number;
  batch?: BatchLimits;
}

export interface Listing {
  symbol: string;
  ticker: string;
  exchange: string | null;
  mic: string | null;
  currency: string;
  kind?: 'INDEX';
}

export interface OptionListing {
  symbol: string;
  underlying: Listing;
  expiration: string;
  right: 'CALL' | 'PUT';
  strike: string;
}

export interface OptionQuote {
  symbol: string;
  bid: string | null;
  ask: string | null;
  last: string | null;
  mark?: string | null;
  volume?: string | null;
  openInterest?: string | null;
  iv?: string | null;
  delta?: string | null;
  gamma?: string | null;
  theta?: string | null;
  vega?: string | null;
  previousClose?: string | null;
  asOf: string;
}

export interface SearchHit {
  ticker: string;
  name: string;
  exchange: string | null;
  mic: string | null;
  currency: string | null;
  type: 'STOCK' | 'ETF';
}

export type ProviderErrorKind = 'AUTH' | 'RATE_LIMIT' | 'NOT_SUPPORTED' | 'UNAVAILABLE' | 'BAD_RESPONSE';

export interface ProviderErrorLike extends Error {
  readonly provider: string;
  readonly kind: ProviderErrorKind;
  readonly status?: number;
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface PluginLogger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
}

export interface HostServices {
  fetchJson<T>(provider: string, url: string, options?: FetchJsonOptions): Promise<T>;
  ProviderError: new (
    provider: string,
    kind: ProviderErrorKind,
    message: string,
    status?: number,
  ) => ProviderErrorLike;
  isProviderError(err: unknown): err is ProviderErrorLike;
  toDecimal(value: unknown): string | null;
  logger: PluginLogger;
}

export interface DataProvider {
  readonly id: string;
  searchSymbols(query: string): Promise<SearchHit[]>;
  getLatestQuotes(listings: readonly Listing[]): Promise<Quote[]>;
  getDailyPrices(listing: Listing, from: string, to: string): Promise<PriceBar[]>;
  getCorporateActions(listing: Listing, from: string): Promise<CorporateActionInfo[]>;
  getOptionQuotes?(options: readonly OptionListing[]): Promise<OptionQuote[]>;
  verifyKey?(): Promise<boolean>;
}

export interface CreateContext {
  apiKey: string | null;
  host: HostServices;
}

export interface ProviderPlugin {
  apiVersion: typeof PLUGIN_API_VERSION;
  id: string;
  name: string;
  version: string;
  capabilities: ProviderCapabilities;
  limits?: ProviderLimits;
  auth: { type: 'apiKey' } | { type: 'none' };
  signupUrl?: string;
  description: { en: string } & Partial<Record<Locale, string>>;
  create(ctx: CreateContext): DataProvider;
}
