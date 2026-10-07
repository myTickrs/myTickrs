import { createHash } from 'node:crypto';
import { existsSync, type FSWatcher, readdirSync, readFileSync, realpathSync, watch } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  marketCode,
  MARKET_PROVIDER_PRIORITY_MAX,
  MARKET_PROVIDER_PRIORITY_MIN,
  PROVIDER_ID_PATTERN,
} from '@tickrs/shared';
import {
  PLUGIN_API_VERSION,
  providerRegistry,
  type ProviderPlugin,
  type ProviderRegistry,
  validatePlugin,
} from '@tickrs/market-data';
import type { Logger } from 'pino';

export const MARKET_PROVIDERS_FILE = 'market-providers.json';

const manifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'version must be semver'),
  type: z.literal('module', { message: 'type must be "module"' }),
  main: z.string().min(1),
  tickrs: z.object({
    providerPlugin: z.literal(PLUGIN_API_VERSION, {
      message: `tickrs.providerPlugin must be ${PLUGIN_API_VERSION}`,
    }),
    id: z.string().regex(PROVIDER_ID_PATTERN, 'tickrs.id is not a valid plugin id'),
  }),
});

const defaultsSchema = z.array(
  z.object({
    market: marketCode,
    provider: z.string().regex(PROVIDER_ID_PATTERN),
    priority: z.number().int().min(MARKET_PROVIDER_PRIORITY_MIN).max(MARKET_PROVIDER_PRIORITY_MAX),
    enabled: z.boolean().default(true),
  }),
);

export interface PluginLoaderOptions {
  dir: string;
  registry?: ProviderRegistry;
  logger?: Logger;
  pollMs?: number;
  debounceMs?: number;
}

interface Loaded {
  id: string;
  sha256: string;
}

export class PluginLoader {
  private readonly registry: ProviderRegistry;
  private readonly loaded = new Map<string, Loaded>();
  private defaultsHash: string | null = null;
  private watcher: FSWatcher | null = null;
  private poll: NodeJS.Timeout | null = null;
  private debounce: NodeJS.Timeout | null = null;
  private scanning: Promise<void> | null = null;
  private again = false;

  constructor(private readonly options: PluginLoaderOptions) {
    this.registry = options.registry ?? providerRegistry;
  }

  get dir(): string {
    return this.options.dir;
  }

  async start(): Promise<void> {
    await this.scan();
    this.watchDir();
    this.poll = setInterval(() => {
      if (!this.watcher) this.watchDir();
      void this.scan();
    }, this.options.pollMs ?? 30_000);
    this.poll.unref();
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.poll) clearInterval(this.poll);
    if (this.debounce) clearTimeout(this.debounce);
    this.poll = this.debounce = null;
  }

  scan(): Promise<void> {
    if (this.scanning) {
      this.again = true;
      return this.scanning;
    }
    this.scanning = (async () => {
      do {
        this.again = false;
        await this.scanOnce();
      } while (this.again);
    })().finally(() => {
      this.scanning = null;
    });
    return this.scanning;
  }

  private watchDir(): void {
    if (!existsSync(this.options.dir)) return;
    try {
      this.watcher = watch(realpathSync.native(this.options.dir), { recursive: true }, () => this.schedule());
      this.watcher.on('error', () => {
        this.watcher?.close();
        this.watcher = null;
      });
      this.watcher.unref();
    } catch {
      this.watcher = null;
    }
  }

  private schedule(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.scan(), this.options.debounceMs ?? 1000);
    this.debounce.unref();
  }

  private async scanOnce(): Promise<void> {
    const dir = this.options.dir;
    const folders = existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
          .map((d) => d.name)
          .toSorted()
      : [];

    for (const folder of this.loaded.keys()) {
      if (!folders.includes(folder)) this.remove(folder, 'removed');
    }
    for (const folder of folders) await this.loadFolder(folder);
    this.loadDefaults();
  }

  private remove(folder: string, why: string): void {
    const loaded = this.loaded.get(folder);
    if (!loaded) return;
    this.loaded.delete(folder);
    this.registry.unregister(loaded.id);
    this.options.logger?.info({ plugin: loaded.id, folder }, `Data-provider plugin ${why}`);
  }

  private fail(folder: string, id: string | null, error: string): void {
    const known = this.registry.loadFailures().find((f) => f.folder === folder);
    if (known?.error !== error) {
      this.options.logger?.warn({ folder, plugin: id, error }, 'Data-provider plugin load failed');
      this.registry.recordFailure({ folder, id, error });
    }
  }

  private async loadFolder(folder: string): Promise<void> {
    const pluginDir = path.join(this.options.dir, folder);
    const manifestPath = path.join(pluginDir, 'package.json');
    if (!existsSync(manifestPath)) {
      this.remove(folder, 'removed');
      this.fail(folder, null, 'package.json is missing');
      return;
    }

    let manifest: z.infer<typeof manifestSchema>;
    try {
      const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(manifestPath, 'utf8')));
      if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join('; '));
      manifest = parsed.data;
    } catch (err) {
      this.remove(folder, 'unloaded');
      this.fail(folder, null, `package.json: ${messageOf(err)}`);
      return;
    }
    const { id } = manifest.tickrs;
    if (folder !== id) {
      this.remove(folder, 'unloaded');
      this.fail(folder, id, `folder name "${folder}" must equal tickrs.id "${id}"`);
      return;
    }

    const mainPath = path.resolve(pluginDir, manifest.main);
    if (!mainPath.startsWith(pluginDir + path.sep) || !existsSync(mainPath)) {
      this.remove(folder, 'unloaded');
      this.fail(folder, id, `main "${manifest.main}" is missing or outside the plugin folder`);
      return;
    }
    const sha256 = createHash('sha256').update(readFileSync(mainPath)).digest('hex');
    if (this.loaded.get(folder)?.sha256 === sha256) return;

    const owner = this.registry.get(id);
    if (owner && owner.dir !== pluginDir) {
      this.fail(folder, id, `another provider already has the id "${id}"`);
      return;
    }

    let plugin: ProviderPlugin;
    try {
      const mod = (await import(`${pathToFileURL(mainPath).href}?v=${sha256}`)) as { default?: unknown };
      const problems = validatePlugin(mod.default);
      if (problems.length > 0) throw new Error(problems.join('; '));
      plugin = mod.default as ProviderPlugin;
      if (plugin.id !== id) throw new Error(`exports id "${plugin.id}", manifest says "${id}"`);
    } catch (err) {
      this.remove(folder, 'unloaded');
      this.fail(folder, id, messageOf(err));
      return;
    }

    const updating = this.loaded.has(folder);
    this.registry.register(plugin, { dir: pluginDir, sha256 });
    this.registry.clearFailure(folder);
    this.loaded.set(folder, { id, sha256 });
    this.options.logger?.info(
      { plugin: id, version: plugin.version, sha256 },
      `Data-provider plugin ${updating ? 'updated' : 'loaded'}`,
    );
  }

  private loadDefaults(): void {
    const file = path.join(this.options.dir, MARKET_PROVIDERS_FILE);
    if (!existsSync(file)) {
      if (this.defaultsHash !== null) {
        this.defaultsHash = null;
        this.registry.setMarketDefaults(null);
      }
      return;
    }
    const text = readFileSync(file, 'utf8');
    const hash = createHash('sha256').update(text).digest('hex');
    if (hash === this.defaultsHash) return;
    this.defaultsHash = hash;
    try {
      const parsed = defaultsSchema.safeParse(JSON.parse(text));
      if (!parsed.success)
        throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      this.registry.setMarketDefaults(parsed.data);
      this.registry.clearFailure(MARKET_PROVIDERS_FILE);
      this.options.logger?.info({ rows: parsed.data.length }, 'Default market providers loaded');
    } catch (err) {
      this.registry.setMarketDefaults(null);
      this.fail(MARKET_PROVIDERS_FILE, null, messageOf(err));
    }
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const loaders = new Map<string, PluginLoader>();

export async function startPluginLoader(options: PluginLoaderOptions): Promise<PluginLoader> {
  const key = path.resolve(options.dir);
  const existing = loaders.get(key);
  if (existing) return existing;
  const loader = new PluginLoader({ ...options, dir: key });
  loaders.set(key, loader);
  await loader.start();
  return loader;
}

export function stopPluginLoaders(): void {
  for (const loader of loaders.values()) loader.stop();
  loaders.clear();
}
