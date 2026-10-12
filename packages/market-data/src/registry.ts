import type { ProviderPlugin } from './plugin/contract.js';
import { validatePlugin } from './plugin/validate.js';
import { KEYLESS_PROVIDERS, PROVIDER_LIMITS } from './limits.js';
import { DEFAULT_BASE_PROVIDER, type MarketProviderRow } from './router.js';

export interface InstalledProvider {
  plugin: ProviderPlugin;
  dir?: string;
  sha256?: string;
  loadedAt: string;
}

export interface PluginLoadFailure {
  folder: string;
  id: string | null;
  error: string;
  at: string;
}

type Listener = () => void;

export class ProviderRegistry {
  private readonly providers = new Map<string, InstalledProvider>();
  private readonly failures = new Map<string, PluginLoadFailure>();
  private defaults: MarketProviderRow[] | null = null;
  private base: string | null = DEFAULT_BASE_PROVIDER;
  private listeners = new Set<Listener>();
  private revision = 0;

  get version(): number {
    return this.revision;
  }

  register(plugin: ProviderPlugin, meta: Omit<InstalledProvider, 'plugin' | 'loadedAt'> = {}): void {
    const problems = validatePlugin(plugin);
    if (problems.length > 0) throw new Error(`Invalid provider plugin: ${problems.join('; ')}`);
    this.providers.set(plugin.id, { plugin, ...meta, loadedAt: new Date().toISOString() });
    if (plugin.limits) PROVIDER_LIMITS[plugin.id] = { ...plugin.limits };
    else delete PROVIDER_LIMITS[plugin.id];
    if (plugin.auth.type === 'none') KEYLESS_PROVIDERS.add(plugin.id);
    else KEYLESS_PROVIDERS.delete(plugin.id);
    this.changed();
  }

  unregister(id: string): boolean {
    if (!this.providers.delete(id)) return false;
    delete PROVIDER_LIMITS[id];
    KEYLESS_PROVIDERS.delete(id);
    this.changed();
    return true;
  }

  get(id: string): InstalledProvider | undefined {
    return this.providers.get(id);
  }

  list(): InstalledProvider[] {
    return [...this.providers.values()].toSorted((a, b) => a.plugin.id.localeCompare(b.plugin.id));
  }

  recordFailure(failure: Omit<PluginLoadFailure, 'at'>): void {
    this.failures.set(failure.folder, { ...failure, at: new Date().toISOString() });
    this.changed();
  }

  clearFailure(folder: string): void {
    if (this.failures.delete(folder)) this.changed();
  }

  loadFailures(): PluginLoadFailure[] {
    return [...this.failures.values()];
  }

  marketDefaults(): MarketProviderRow[] | null {
    return this.defaults;
  }

  setMarketDefaults(rows: MarketProviderRow[] | null): void {
    this.defaults = rows;
    this.changed();
  }

  baseProvider(): string | null {
    return this.base;
  }

  setBaseProvider(id: string | null): void {
    this.base = id;
    this.changed();
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    for (const id of this.providers.keys()) {
      delete PROVIDER_LIMITS[id];
      KEYLESS_PROVIDERS.delete(id);
    }
    this.providers.clear();
    this.failures.clear();
    this.defaults = null;
    this.base = DEFAULT_BASE_PROVIDER;
    this.changed();
  }

  private changed(): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }
}

export const providerRegistry = new ProviderRegistry();
