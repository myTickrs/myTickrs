import { estimateRequests, isKeyless } from '@tickrs/market-data';
import type { BatchedCall, RequestMeter } from '@tickrs/market-data';
import type { StockDataProviderId } from '@tickrs/shared';

const unquotable = new Map<string, { day: string; keys: Set<string> }>();
export const unquotableKey = (
  userId: string,
  provider: StockDataProviderId,
  keyMarket: string,
  symbol: string,
) => (isKeyless(provider) ? `*|${provider}|${symbol}` : `${userId}|${provider}@${keyMarket}|${symbol}`);

export function chargedRequests(
  provider: string,
  call: BatchedCall,
  items: readonly string[],
  meter: RequestMeter,
  underlyingOf?: (item: string) => string,
): number {
  return Math.max(meter.requests, estimateRequests(provider, call, items, underlyingOf));
}

export function unquotableOn(market: string, day: string): Set<string> {
  let found = unquotable.get(market);
  if (found?.day !== day) {
    found = { day, keys: new Set() };
    unquotable.set(market, found);
  }
  return found.keys;
}

export function resetUnquotable(): void {
  unquotable.clear();
}
