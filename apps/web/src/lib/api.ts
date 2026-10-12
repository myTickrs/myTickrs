import { FX_RATES_HEADER, IMPORT_MEDIA_TYPE, formatFxRatesHeader } from '@tickrs/shared';
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

export function isConfirmationRequired(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === 'CONFIRMATION_REQUIRED';
}

export function withQuery(path: string, params: Record<string, string | undefined>): string {
  const set = Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined && e[1] !== '');
  const query = new URLSearchParams(set).toString();
  return query ? `${path}?${query}` : path;
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

export type {
  AccountDto as Account,
  CurrencyItem,
  CurrencyList,
  FeeQuote as FeeBreakdown,
  KnownContractTerms,
  MarketInfo,
  MarketItem,
  MarketProviderRow,
  NeedsActionItem,
  OptionPosition,
  Paged,
  ProviderCapabilities,
  ProviderKey,
  ProviderSetting,
  ProvidersResponse,
  SecurityMatch,
  TransactionDto as Transaction,
  UserSettings as Settings,
} from '@tickrs/shared';
