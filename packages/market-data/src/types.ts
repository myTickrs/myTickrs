import type { StockDataProviderId } from '@tickrs/shared';
import type {
  CorporateActionInfo,
  PriceBar,
  ProviderCapabilities,
  OptionQuote as PluginOptionQuote,
  Quote as PluginQuote,
} from './plugin/contract.js';

export type { CorporateActionInfo, PriceBar, ProviderCapabilities } from './plugin/contract.js';
export { ProviderError } from './plugin/runtime.js';

export interface SecurityInfo {
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string;
  type: 'STOCK' | 'ETF';
}

export type Quote = Required<PluginQuote>;

export interface StockDataProvider {
  readonly id: StockDataProviderId;
  readonly capabilities: ProviderCapabilities;
  searchSymbols(query: string): Promise<SecurityInfo[]>;
  getLatestQuotes(symbols: readonly string[], meter?: RequestMeter): Promise<Quote[]>;
  getDailyPrices(symbol: string, from: string, to: string): Promise<PriceBar[]>;
  getCorporateActions(symbol: string, from: string): Promise<CorporateActionInfo[]>;
  getOptionQuotes?(options: readonly OptionQuoteRequest[], meter?: RequestMeter): Promise<OptionQuoteInfo[]>;
}

export type OptionQuoteInfo = Required<PluginOptionQuote>;

export interface OptionQuoteRequest {
  symbol: string;
  underlying: string;
  expiration: string;
  right: 'CALL' | 'PUT';
  strike: string;
}

export interface RequestMeter {
  requests: number;
}
