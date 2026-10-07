import type { BatchLimits, ProviderLimits } from './plugin/contract.js';

export type { BatchLimits, ProviderLimits };

export type BatchedCall = keyof BatchLimits;

export function estimateRequests(
  provider: string,
  call: BatchedCall,
  items: readonly string[],
  underlyingOf: (item: string) => string = (item) => item,
): number {
  if (items.length === 0) return 0;
  const batch = PROVIDER_LIMITS[provider]?.batch?.[call] ?? 1;
  if (batch === 'underlying') return new Set(items.map(underlyingOf)).size;
  return Math.ceil(items.length / batch);
}

export function fitBudget<T extends string>(
  provider: string,
  call: BatchedCall,
  items: readonly T[],
  budget: number,
  underlyingOf?: (item: string) => string,
): T[] {
  if (budget <= 0) return [];
  const batch = PROVIDER_LIMITS[provider]?.batch?.[call] ?? 1;
  if (batch !== 'underlying') return items.slice(0, budget * batch);
  const of = underlyingOf ?? ((item: string) => item);
  const groups = new Set<string>();
  const fit: T[] = [];
  for (const item of items) {
    const group = of(item);
    if (!groups.has(group)) {
      if (groups.size === budget) continue;
      groups.add(group);
    }
    fit.push(item);
  }
  return fit;
}

export const PROVIDER_LIMITS: Record<string, ProviderLimits> = {};

export const KEYLESS_PROVIDERS = new Set<string>();

export const isKeyless = (provider: string): boolean => KEYLESS_PROVIDERS.has(provider);

const bucketKey = (userId: string, provider: string, market: string) =>
  isKeyless(provider) ? `*:${provider}:*` : `${userId}:${provider}:${market}`;

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export function availableThisMinute(userId: string, provider: string, market = ''): number {
  const limit = PROVIDER_LIMITS[provider]?.perMinute ?? 60;
  const key = bucketKey(userId, provider, market);
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: limit, updatedAt: now };
  const refill = ((now - bucket.updatedAt) / 60_000) * limit;
  const tokens = Math.min(limit, bucket.tokens + refill);
  buckets.set(key, { tokens, updatedAt: now });
  return Math.floor(tokens);
}

export function spendTokens(userId: string, provider: string, market: string, count: number): void {
  const key = bucketKey(userId, provider, market);
  const bucket = buckets.get(key);
  if (bucket) buckets.set(key, { tokens: Math.max(0, bucket.tokens - count), updatedAt: Date.now() });
}

export const NOT_SUPPORTED_SKIP_MS = 60 * 60_000;
const notSupported = new Map<string, number>();

export function markNotSupported(userId: string, provider: string, capability: string): void {
  notSupported.set(`${userId}:${provider}:${capability}`, Date.now() + NOT_SUPPORTED_SKIP_MS);
}

export function isNotSupported(userId: string, provider: string, capability: string): boolean {
  const key = `${userId}:${provider}:${capability}`;
  const until = notSupported.get(key);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  notSupported.delete(key);
  return false;
}

export function resetRateLimits(): void {
  buckets.clear();
  notSupported.clear();
}
