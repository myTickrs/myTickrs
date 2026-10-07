import { NO_MARKET_PROVIDERS, type MarketId, type StockDataProviderId } from '@tickrs/shared';
import type { Logger } from 'pino';
import { isProviderError } from './plugin/runtime.js';
import { isNotSupported, markNotSupported } from './limits.js';
import type { ProviderCapabilities, StockDataProvider } from './types.js';

export type Capability = keyof ProviderCapabilities;

export interface MarketProviderRow {
  market: MarketId;
  provider: StockDataProviderId;
  priority: number;
  enabled: boolean;
}

export const DEFAULT_MARKET_PROVIDERS: readonly MarketProviderRow[] = [
  { market: 'US', provider: 'finnhub', priority: 1, enabled: true },
  { market: 'US', provider: 'twelvedata', priority: 2, enabled: true },
];

export const DEFAULT_BASE_PROVIDER: StockDataProviderId = 'yahoo';

export function operatorDefaults(fileRows: readonly MarketProviderRow[] | null): MarketProviderRow[] {
  if (!fileRows) return [...DEFAULT_MARKET_PROVIDERS];
  const named = new Set(fileRows.map((r) => r.market));
  return [...DEFAULT_MARKET_PROVIDERS.filter((r) => !named.has(r.market)), ...fileRows];
}

export interface Associations {
  defaults: readonly MarketProviderRow[];
  user: readonly MarketProviderRow[];
  base?: StockDataProviderId | null;
}

const byPriority = (a: MarketProviderRow, b: MarketProviderRow) =>
  a.priority - b.priority || a.provider.localeCompare(b.provider);

export function effectiveRows(associations: Associations, market: MarketId): MarketProviderRow[] {
  const own = associations.user.filter((r) => r.market === market);
  const rows = own.length > 0 ? own : associations.defaults.filter((r) => r.market === market);
  return rows
    .filter((r) => r.provider !== associations.base && r.provider !== NO_MARKET_PROVIDERS)
    .toSorted(byPriority);
}

export function marketOrder(associations: Associations, market: MarketId): StockDataProviderId[] {
  const order = effectiveRows(associations, market)
    .filter((r) => r.enabled)
    .map((r) => r.provider);
  return associations.base ? [...order, associations.base] : order;
}

export function searchOrder(
  associations: Associations,
  markets: readonly MarketId[],
): { provider: StockDataProviderId; market: MarketId }[] {
  const best = new Map<string, { priority: number; market: MarketId }>();
  for (const market of markets) {
    for (const row of effectiveRows(associations, market)) {
      if (!row.enabled) continue;
      const found = best.get(row.provider);
      if (!found || row.priority < found.priority) best.set(row.provider, { priority: row.priority, market });
    }
  }
  const order = [...best.entries()]
    .toSorted(([a, pa], [b, pb]) => pa.priority - pb.priority || a.localeCompare(b))
    .map(([provider, { market }]) => ({ provider, market }));
  const home = markets[0];
  return associations.base && home ? [...order, { provider: associations.base, market: home }] : order;
}

export interface RouterOptions {
  markets: readonly MarketId[];
  userId?: string;
  logger?: Logger;
}

export type ProviderForMarket = (
  provider: StockDataProviderId,
  market: MarketId,
) => StockDataProvider | undefined;

export interface Candidate {
  provider: StockDataProvider;
  market: MarketId;
}

export class StockDataRouter {
  constructor(
    private readonly providerFor: ProviderForMarket,
    private readonly associations: Associations,
    private readonly options: RouterOptions,
  ) {}

  candidates(capability: Capability, market?: MarketId): Candidate[] {
    const order =
      market === undefined
        ? searchOrder(this.associations, this.options.markets)
        : marketOrder(this.associations, market).map((provider) => ({ provider, market }));
    const userId = this.options.userId ?? '';
    return order.flatMap(({ provider: id, market: keyMarket }) => {
      const provider = this.providerFor(id, keyMarket);
      return provider &&
        provider.capabilities[capability] &&
        !isNotSupported(userId, `${provider.id}@${keyMarket}`, capability)
        ? [{ provider, market: keyMarket }]
        : [];
    });
  }

  has(capability: Capability, market?: MarketId): boolean {
    return this.candidates(capability, market).length > 0;
  }

  async run<T>(
    capability: Capability,
    work: (provider: StockDataProvider, market: MarketId) => Promise<T>,
    options: {
      market?: MarketId;
      allow?: (provider: StockDataProvider, market: MarketId) => Promise<boolean> | boolean;
    } = {},
  ): Promise<{ result: T; provider: StockDataProviderId; market: MarketId } | null> {
    const logger = this.options.logger;
    let failed = false;
    for (const { provider, market } of this.candidates(capability, options.market)) {
      if (options.allow && !(await options.allow(provider, market))) continue;
      try {
        return { result: await work(provider, market), provider: provider.id, market };
      } catch (err) {
        if (!isProviderError(err)) throw err;
        failed = true;
        if (err.kind === 'NOT_SUPPORTED') {
          markNotSupported(this.options.userId ?? '', `${provider.id}@${market}`, capability);
        }
        logger?.warn({ provider: provider.id, kind: err.kind, market }, `Market data: ${err.message}`);
      }
    }
    if (failed) logger?.warn({ capability, market: options.market }, 'No market-data provider could answer');
    return null;
  }
}
