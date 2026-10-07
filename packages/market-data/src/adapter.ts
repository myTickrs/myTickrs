import type { Logger } from 'pino';
import type { HostServices, ProviderPlugin } from './plugin/contract.js';
import { fetchJson, isProviderError, ProviderError, toDecimal } from './plugin/runtime.js';
import { DEFAULT_REGISTRY, type MarketRegistry } from './markets.js';
import type { OptionQuoteInfo, RequestMeter, SecurityInfo, StockDataProvider } from './types.js';

export function createHostServices(pluginId: string, logger?: Logger): HostServices {
  const scoped = logger?.child({ plugin: pluginId });
  return {
    fetchJson,
    ProviderError,
    isProviderError,
    toDecimal,
    logger: {
      debug: (obj, msg) => scoped?.debug(obj, msg),
      info: (obj, msg) => scoped?.info(obj, msg),
      warn: (obj, msg) => scoped?.warn(obj, msg),
    },
  };
}

function meteredHost(host: HostServices, meter: RequestMeter): HostServices {
  return {
    ...host,
    fetchJson: (provider, url, options) => {
      meter.requests += 1;
      return host.fetchJson(provider, url, options);
    },
  };
}

export function adaptPlugin(
  plugin: ProviderPlugin,
  apiKey: string | null,
  registry: MarketRegistry = DEFAULT_REGISTRY,
  logger?: Logger,
): StockDataProvider {
  const host = createHostServices(plugin.id, logger);
  const provider = plugin.create({ apiKey, host });
  const instance = (meter?: RequestMeter) =>
    meter ? plugin.create({ apiKey, host: meteredHost(host, meter) }) : provider;
  const quotesOptions =
    plugin.capabilities.optionQuotes === true && typeof provider.getOptionQuotes === 'function';
  return {
    id: plugin.id,
    capabilities: { ...plugin.capabilities, optionQuotes: quotesOptions },

    async searchSymbols(query) {
      const hits = await provider.searchSymbols(query);
      const seen = new Set<string>();
      const items: SecurityInfo[] = [];
      for (const hit of hits) {
        const symbol = registry.symbolOfHit(hit);
        if (!symbol || seen.has(symbol)) continue;
        seen.add(symbol);
        items.push({
          symbol,
          name: hit.name || symbol,
          exchange: hit.exchange,
          currency: hit.currency ?? registry.currencyOf(symbol),
          type: hit.type,
        });
      }
      return items;
    },

    async getLatestQuotes(symbols, meter) {
      if (symbols.length === 0) return [];
      const asked = new Set(symbols);
      const quotes = await instance(meter).getLatestQuotes(symbols.map((s) => registry.listingOf(s)));
      return quotes
        .filter((q) => asked.has(q.symbol))
        .map((q) => ({
          ...q,
          open: q.open ?? null,
          high: q.high ?? null,
          low: q.low ?? null,
          previousClose: q.previousClose ?? null,
        }));
    },

    getDailyPrices: (symbol, from, to) => provider.getDailyPrices(registry.listingOf(symbol), from, to),

    async getCorporateActions(symbol, from) {
      const actions = await provider.getCorporateActions(registry.listingOf(symbol), from);
      return actions.filter((a) => a.symbol === symbol);
    },

    ...(quotesOptions
      ? {
          async getOptionQuotes(options, meter) {
            if (options.length === 0) return [];
            const asked = new Set(options.map((o) => o.symbol));
            const quotes = await instance(meter).getOptionQuotes!(
              options.map((o) => ({ ...o, underlying: registry.listingOf(o.underlying) })),
            );
            const seen = new Set<string>();
            return quotes
              .filter((q) => asked.has(q.symbol) && !seen.has(q.symbol) && seen.add(q.symbol))
              .filter((q) => q.bid != null || q.ask != null || q.last != null)
              .map((q): OptionQuoteInfo => ({
                symbol: q.symbol,
                bid: q.bid ?? null,
                ask: q.ask ?? null,
                last: q.last ?? null,
                mark: q.mark ?? null,
                volume: q.volume ?? null,
                openInterest: q.openInterest ?? null,
                iv: q.iv ?? null,
                delta: q.delta ?? null,
                gamma: q.gamma ?? null,
                theta: q.theta ?? null,
                vega: q.vega ?? null,
                previousClose: q.previousClose ?? null,
                asOf: q.asOf,
              }));
          },
        }
      : {}),
  };
}

export async function verifyPluginKey(
  plugin: ProviderPlugin,
  apiKey: string | null,
  test: { symbol: string; registry: MarketRegistry } = { symbol: 'SPY', registry: DEFAULT_REGISTRY },
  logger?: Logger,
): Promise<boolean> {
  const provider = plugin.create({ apiKey, host: createHostServices(plugin.id, logger) });
  if (provider.verifyKey) return provider.verifyKey();
  const quotes = await provider.getLatestQuotes([test.registry.listingOf(test.symbol)]);
  return quotes.length > 0;
}
