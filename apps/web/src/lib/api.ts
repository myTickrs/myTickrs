import {
  FX_RATES_HEADER,
  IMPORT_MEDIA_TYPE,
  formatFxRatesHeader,
  type MarketDef,
  type OptionSettlement,
  type OptionStyle,
} from '@tickrs/shared';
import { currentFxRates } from './fx-rate-store.js';
import { currentLanguage } from '@tickrs/ui';
import { t } from '../i18n.js';

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get fieldErrors(): Record<string, string> {
    const issues = (this.details as { issues?: { path: string; message: string }[] } | undefined)?.issues;
    return Object.fromEntries((issues ?? []).map((i) => [i.path, i.message]));
  }
}

export function errorText(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  return serverText(error.code, error.message);
}

export function serverText(code: string | undefined, message: string): string {
  if (!code || currentLanguage() === 'en') return message;
  return (t as unknown as (key: string, options: object) => string)(`errors.${code}`, {
    defaultValue: message,
  });
}

export const serverWording = (message: string, translated: string): string =>
  currentLanguage() === 'en' ? message : translated;

export function fieldErrorsOf(error: ApiError): Record<string, string> {
  const errors = error.fieldErrors;
  if (currentLanguage() === 'en') return errors;
  return Object.fromEntries(Object.keys(errors).map((path) => [path, t('errors.field')]));
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  contentType = 'application/json',
): Promise<T> {
  const headers: Record<string, string> = body === undefined ? {} : { 'content-type': contentType };
  const rates = currentFxRates();
  if (rates.length > 0) headers[FX_RATES_HEADER] = formatFxRatesHeader(rates);
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : {};
  if (!response.ok) {
    const { error } = payload as ApiErrorBody;
    throw new ApiError(
      error?.code ?? 'UNKNOWN',
      response.status,
      error?.message ?? 'Request failed',
      error?.details,
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
  importPost: <T>(path: string, body: unknown) => request<T>('POST', path, body, IMPORT_MEDIA_TYPE),
};

export interface Account {
  id: string;
  name: string;
  broker: string | null;
  currency: string;
  feeScheduleId: string | null;
}

export interface Transaction {
  id: string;
  accountId: string;
  assetClass: 'STOCK' | 'OPTION';
  type: string;
  tradeDate: string;
  symbol: string;
  currency: string;
  quantity: string | null;
  price: string | null;
  fee: string;
  feeSource: 'AUTO' | 'MANUAL' | 'IMPORTED';
  amount: string | null;
  splitFrom: string | null;
  splitTo: string | null;
  realizedBefore?: string | null;
  linkedTxnId: string | null;
  isSystemGenerated: boolean;
  notes: string | null;
  cashEffect: string | null;
  optionContract: {
    id: string;
    underlying: string;
    expiration: string;
    strike: string;
    issuedStrike?: string;
    right: 'CALL' | 'PUT';
    multiplier: string;
    isAdjusted: boolean;
  } | null;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface StockHolding {
  symbol: string;
  currency: string;
  side: 'LONG' | 'SHORT';
  quantity: string;
  costBasis: string;
  averagePrice: string;
  price: string;
  priceEstimated: boolean;
  priceAsOf: string | null;
  marketValue: string;
  unrealized: string;
  realized: string;
  dividends: string;
  fxRate: string;
  marketValueBase: string;
  dayChange: { amount: string; percent: string | null };
}

export interface SecurityMatch {
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string;
  type: 'STOCK' | 'ETF';
  market?: string | null;
}

export interface MarketItem extends MarketDef {
  isHome: boolean;
  openNow: boolean;
  symbols: number;
}

export interface OptionPosition {
  contractId: string;
  underlying: string;
  currency: string;
  side: 'LONG' | 'SHORT';
  contracts: string;
  description: string;
  accounts: { id: string; name: string }[];
  expiration: string;
  strike: string;
  right: 'CALL' | 'PUT';
  multiplier: string;
  style: OptionStyle;
  settlement: OptionSettlement;
  openAmount: string;
  averagePremium: string;
  mark: string;
  markEstimated: boolean;
  markSource: string | null;
  markAsOf: string | null;
  marketValue: string;
  unrealized: string;
  dayChange: { amount: string; percent: string | null };
  daysToExpiration: number;
  needsAction: boolean;
  moneyness: 'ITM' | 'ATM' | 'OTM' | null;
  breakEven: string;
  coverage: 'COVERED' | 'PARTIAL' | 'NAKED' | null;
  returnOnRisk: string | null;
  annualizedReturnOnRisk: string | null;
  isAdjusted: boolean;
  rollChain: { strategyGroupId: string; rolls: number; netPremium: string } | null;
  openingTxnIds?: string[];
}

export interface KnownContractTerms {
  underlying: string;
  multiplier: string | null;
  style: OptionStyle | null;
  settlement: OptionSettlement | null;
  source: 'CONTRACT' | 'UNDERLYING' | 'MARKET' | null;
}

export interface Settings {
  baseCurrency: string;
  averagePriceScope: 'LIFETIME' | 'CURRENT';
  optionPremiumTreatment: 'ROLL_INTO_STOCK' | 'SEPARATE';
  autoExpireOtm: boolean;
  shortBuyHandling: 'BLOCK' | 'COVER';
  borrowFeeTreatment: 'REALIZED' | 'SEPARATE';
  optionDataSource: string;
}

export interface CurrencyItem {
  code: string;
  name: string;
  isBase: boolean;
  accounts: number;
  transactions: number;
  rateToBase: string | null;
}

export interface CurrencyList {
  baseCurrency: string;
  items: CurrencyItem[];
}

export interface FeeBreakdown {
  commission: string;
  secFee: string;
  taf: string;
  orf: string;
  total: string;
}

export interface NeedsActionItem {
  contractId: string;
  accountId: string | null;
  description: string;
  underlying: string;
  expiration: string;
  side: 'LONG' | 'SHORT';
  contracts: string;
  underlyingClose: string | null;
  settlement: OptionSettlement;
  suggestedOutcome: 'EXP' | 'ASN' | 'EXR' | null;
  moneyness: 'ITM' | 'ATM' | 'OTM' | null;
}

export interface ProviderCapabilities {
  search: boolean;
  quotes: boolean;
  history: boolean;
  corporateActions: boolean;
}

export interface ProviderSetting {
  provider: string;
  installed: boolean;
  name: string;
  version: string | null;
  description: Record<string, string> | null;
  signupUrl: string | null;
  auth: 'apiKey' | 'none';
  capabilities: ProviderCapabilities | null;
  limitPerDay: number | null;
  limitPerMinute: number | null;
}

export interface MarketInfo {
  id: string;
  name: string;
  currency: string;
  suffixes: MarketDef['suffixes'];
}

export interface MarketProviderRow {
  market: string;
  provider: string;
  priority: number;
  enabled: boolean;
}

export interface ProviderKey {
  provider: string;
  market: string;
  keyHint: string;
  status: 'VALID' | 'INVALID' | 'UNTESTED';
  lastVerifiedAt: string | null;
  usedToday: number;
}

export interface ProvidersResponse {
  items: ProviderSetting[];
  keys: ProviderKey[];
  markets: MarketInfo[];
  associations: { defaults: MarketProviderRow[]; user: MarketProviderRow[] };
  baseProvider: string | null;
  registryVersion: number;
  pluginsDir: string | null;
  loadErrors: { folder: string; id: string | null; error: string }[];
  optionDataSource: string;
  optionDataSources: { id: string }[];
}
