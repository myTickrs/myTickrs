import type { FetchJsonOptions, ProviderErrorKind, ProviderErrorLike } from './contract.js';

export class ProviderError extends Error implements ProviderErrorLike {
  override name = 'ProviderError';

  constructor(
    readonly provider: string,
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const KINDS: readonly string[] = ['AUTH', 'RATE_LIMIT', 'NOT_SUPPORTED', 'UNAVAILABLE', 'BAD_RESPONSE'];

export function isProviderError(err: unknown): err is ProviderErrorLike {
  if (!(err instanceof Error) || err.name !== 'ProviderError') return false;
  const e = err as Partial<ProviderErrorLike>;
  return typeof e.provider === 'string' && typeof e.kind === 'string' && KINDS.includes(e.kind);
}

export async function fetchJson<T>(
  provider: string,
  url: string,
  options: FetchJsonOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json', ...options.headers },
      signal: AbortSignal.timeout(Math.min(options.timeoutMs ?? 8000, 15_000)),
    });
  } catch (err) {
    throw new ProviderError(provider, 'UNAVAILABLE', `${provider} did not respond: ${String(err)}`);
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderError(provider, 'AUTH', `${provider} rejected the API key`, response.status);
  }
  if (response.status === 429) {
    throw new ProviderError(provider, 'RATE_LIMIT', `${provider} rate limit reached`, 429);
  }
  if (!response.ok) {
    throw new ProviderError(
      provider,
      'UNAVAILABLE',
      `${provider} responded ${response.status}`,
      response.status,
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderError(provider, 'BAD_RESPONSE', `${provider} returned invalid JSON`);
  }
}

export function toDecimal(value: unknown): string | null {
  if (value == null || value === '') return null;
  const s = typeof value === 'number' ? value.toString() : String(value).trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? s : null;
}
