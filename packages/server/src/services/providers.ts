import path from 'node:path';
import type { StoreTx } from '../store/ports.js';
import type { Ctx } from '../context.js';
import {
  MARKET_PROVIDER_PRIORITY_MIN,
  NO_MARKET_PROVIDERS,
  OPTION_DATA_SOURCES,
  PROVIDER_ID_PATTERN,
  type MarketProvidersInput,
  type StockDataProviderId,
} from '@tickrs/shared';
import type { ServerConfig } from '../server-config.js';
import { AppError } from '../errors.js';
import {
  adaptPlugin,
  isProviderError,
  operatorDefaults,
  PROVIDER_LIMITS,
  providerRegistry,
  StockDataRouter,
  verifyPluginKey,
  type Associations,
  type StockDataProvider,
} from '@tickrs/market-data';
import { decryptKey, encryptKey, resolveMasterKey } from './key-crypto.js';
import { loadMarkets, loadRegistry } from './markets.js';

export type CryptoConfig = Pick<ServerConfig, 'keyEncryptionKey' | 'localKeyFile' | 'repoRoot' | 'appsDir'>;

export function pluginsDirOf(config: Pick<ServerConfig, 'repoRoot' | 'appsDir'>): string {
  return path.join(config.appsDir ?? path.join(config.repoRoot, 'apps'), 'plugins', 'dataproviders');
}

const keyOf = (provider: string, market: string) => `${provider}\u0000${market}`;

export async function loadApiKeys(data: StoreTx, config: CryptoConfig): Promise<Map<string, string>> {
  const rows = await data.providerKeys.list();
  if (rows.length === 0) return new Map();
  const master = resolveMasterKey(config);
  const keys = new Map<string, string>();
  for (const row of rows) {
    if (row.enabled !== 1) continue;
    keys.set(
      keyOf(row.provider, row.market),
      decryptKey(master, {
        ciphertext: row.apiKeyCiphertext,
        iv: row.apiKeyIv,
        authTag: row.apiKeyAuthTag,
      }),
    );
  }
  return keys;
}

async function associationsOf(data: StoreTx): Promise<Associations> {
  return {
    defaults: operatorDefaults(providerRegistry.marketDefaults()),
    user: await data.marketProviders.list(),
    base: providerRegistry.baseProvider(),
  };
}

export async function buildRouter(ctx: Pick<Ctx, 'data' | 'crypto' | 'principal'>): Promise<StockDataRouter> {
  const [keys, associations, registry] = await Promise.all([
    loadApiKeys(ctx.data, ctx.crypto),
    associationsOf(ctx.data),
    loadRegistry(ctx.data),
  ]);
  const made = new Map<string, StockDataProvider | undefined>();
  const providerFor = (id: StockDataProviderId, market: string): StockDataProvider | undefined => {
    const at = keyOf(id, market);
    if (!made.has(at)) {
      const plugin = providerRegistry.get(id)?.plugin;
      const key = keys.get(at);
      made.set(
        at,
        !plugin
          ? undefined
          : plugin.auth.type === 'none'
            ? adaptPlugin(plugin, null, registry)
            : key
              ? adaptPlugin(plugin, key, registry)
              : undefined,
      );
    }
    return made.get(at);
  };
  return new StockDataRouter(providerFor, associations, {
    markets: registry.codes,
    userId: ctx.principal.userId,
  });
}

export async function buildBaseRouter(data: StoreTx): Promise<StockDataRouter | null> {
  const base = providerRegistry.baseProvider();
  const plugin = base ? providerRegistry.get(base)?.plugin : undefined;
  if (!base || !plugin || plugin.auth.type !== 'none') return null;
  const registry = await loadRegistry(data);
  const provider = adaptPlugin(plugin, null, registry);
  return new StockDataRouter(
    (id) => (id === base ? provider : undefined),
    { defaults: [], user: [], base },
    {
      markets: registry.codes,
    },
  );
}

export async function listProviderSettings(ctx: Ctx) {
  const data = ctx.data;
  const [rows, user, associations, markets] = await Promise.all([
    data.providerKeys.list(),
    data.users.require(),
    associationsOf(data),
    loadMarkets(data),
  ]);
  const installed = providerRegistry.list();
  const ids = [...new Set([...installed.map((p) => p.plugin.id), ...rows.map((r) => r.provider)])].toSorted();
  const items = ids.map((provider) => {
    const plugin = providerRegistry.get(provider)?.plugin;
    const limits = PROVIDER_LIMITS[provider];
    return {
      provider,
      installed: plugin != null,
      name: plugin?.name ?? provider,
      version: plugin?.version ?? null,
      description: plugin?.description ?? null,
      signupUrl: plugin?.signupUrl ?? null,
      auth: plugin?.auth.type ?? 'apiKey',
      capabilities: plugin?.capabilities ?? null,
      limitPerDay: limits?.perDay ?? null,
      limitPerMinute: limits?.perMinute ?? null,
    };
  });
  const keys = await Promise.all(
    rows.map(async (row) => ({
      provider: row.provider,
      market: row.market,
      keyHint: row.keyHint,
      status: row.status,
      lastVerifiedAt: row.lastVerifiedAt,
      usedToday: await data.usage.today(row.provider, row.market),
    })),
  );
  return {
    items,
    keys,
    markets: markets.map((m) => ({ id: m.code, name: m.name, currency: m.currency, suffixes: m.suffixes })),
    associations,
    baseProvider: associations.base && providerRegistry.get(associations.base) ? associations.base : null,
    registryVersion: providerRegistry.version,
    pluginsDir: ctx.crypto.localKeyFile ? pluginsDirOf(ctx.crypto) : null,
    loadErrors: providerRegistry.loadFailures().map(({ folder, id, error }) => ({ folder, id, error })),
    optionDataSource: user.optionDataSource,
    optionDataSources: OPTION_DATA_SOURCES.map((id) => ({
      id,
      available: id === 'none',
      capabilities:
        id === 'none'
          ? { chain: false, quotes: false, history: false, greeks: false }
          : { chain: true, quotes: true, history: true, greeks: true },
    })),
  };
}

function assertProviderId(provider: string): void {
  if (!PROVIDER_ID_PATTERN.test(provider)) {
    throw new AppError('VALIDATION_FAILED', 422, `"${provider}" is not a provider id`);
  }
}

export async function saveProviderApiKey(ctx: Ctx, provider: string, market: string, apiKey: string) {
  assertProviderId(provider);
  await assertMarket(ctx.data, market);
  const master = resolveMasterKey(ctx.crypto);
  await ctx.data.providerKeys.save(provider, market, encryptKey(master, apiKey.trim()));
  if (!providerRegistry.get(provider)) {
    return {
      provider,
      market,
      status: 'UNTESTED' as const,
      message: 'Saved. The provider is not installed yet.',
    };
  }
  return testProviderApiKey(ctx, provider, market);
}

export async function testProviderApiKey(ctx: Ctx, provider: string, market: string) {
  const data = ctx.data;
  const row = await data.providerKeys.find(provider, market);
  if (!row) throw new AppError('NOT_FOUND', 404, 'No key saved for this provider in this market');
  const plugin = providerRegistry.get(provider)?.plugin;
  if (!plugin) throw new AppError('NOT_FOUND', 404, 'This provider is not installed');
  const keys = await loadApiKeys(data, ctx.crypto);
  const apiKey = keys.get(keyOf(provider, market));
  if (!apiKey) throw new AppError('NOT_FOUND', 404, 'No key saved for this provider in this market');

  try {
    const registry = await loadRegistry(data);
    const ok = await verifyPluginKey(plugin, apiKey, {
      symbol: registry.get(market)?.testSymbol ?? registry.home?.testSymbol ?? 'SPY',
      registry,
    });
    await data.providerKeys.setStatus(provider, market, ok ? 'VALID' : 'INVALID');
    return {
      provider,
      market,
      status: ok ? ('VALID' as const) : ('INVALID' as const),
      message: ok ? 'Key works' : 'The provider answered, but returned no data',
    };
  } catch (err) {
    const kind = isProviderError(err) ? err.kind : 'UNAVAILABLE';
    await data.providerKeys.setStatus(provider, market, kind === 'AUTH' ? 'INVALID' : 'UNTESTED');
    return {
      provider,
      market,
      status: kind === 'AUTH' ? ('INVALID' as const) : ('UNTESTED' as const),
      message: err instanceof Error ? err.message : 'The provider could not be reached',
    };
  }
}

export async function removeProviderApiKey(ctx: Ctx, provider: string, market: string): Promise<void> {
  await ctx.data.providerKeys.delete(provider, market);
}

async function assertMarket(data: StoreTx, market: string): Promise<void> {
  if (!(await loadMarkets(data)).some((m) => m.code === market)) {
    throw new AppError('VALIDATION_FAILED', 422, `Unknown market "${market}"`);
  }
}

export async function setMarketProviders(ctx: Ctx, market: string, input: MarketProvidersInput) {
  await assertMarket(ctx.data, market);
  const base = providerRegistry.baseProvider();
  const rows = input.rows.filter((r) => r.provider !== base);
  if (rows.length === 0) {
    rows.push({ provider: NO_MARKET_PROVIDERS, priority: MARKET_PROVIDER_PRIORITY_MIN, enabled: false });
  }
  await ctx.store.transaction(ctx.principal, (tx) => tx.marketProviders.replaceMarket(market, rows));
  return listProviderSettings(ctx);
}

export async function resetMarketProviders(ctx: Ctx, market: string) {
  await assertMarket(ctx.data, market);
  await ctx.data.marketProviders.resetMarket(market);
  return listProviderSettings(ctx);
}

export async function setOptionDataSource(ctx: Ctx, source: string) {
  const data = ctx.data;
  if (!OPTION_DATA_SOURCES.includes(source as (typeof OPTION_DATA_SOURCES)[number])) {
    throw new AppError('VALIDATION_FAILED', 422, `Unknown option data source "${source}"`);
  }
  if (source !== 'none') {
    const key = await data.providerKeys.find(source, 'US');
    if (!key || key.status !== 'VALID') {
      throw new AppError(
        'MISSING_PROVIDER_KEY',
        422,
        `Save a valid ${source} API key before switching to it`,
        { provider: source },
      );
    }
    throw new AppError('NOT_IMPLEMENTED', 501, `The ${source} adapter is not available yet`, {
      provider: source,
    });
  }
  await data.users.updateSettings({ optionDataSource: 'none' });
  return listProviderSettings(ctx);
}
