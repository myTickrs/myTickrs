import type { ProviderPlugin } from './contract.js';

export * from './contract.js';

export function definePlugin(plugin: ProviderPlugin): ProviderPlugin {
  return plugin;
}
