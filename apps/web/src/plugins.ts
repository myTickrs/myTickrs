import type { Entitlement } from '@tickrs/shared';
import type { NavItem } from '@tickrs/ui';
import type { ComponentType, ReactElement, ReactNode } from 'react';

export type Label = string | (() => string);

export const labelText = (label: Label): string => (typeof label === 'function' ? label() : label);

export interface SettingsTab extends Omit<PluginSettingsTab, 'label'> {
  label: string;
}

export interface ShellApi {
  openAddTransaction(): void;
  settingsTabs: readonly SettingsTab[];
}

export interface PluginRoute {
  path: string;
  render(shell: ShellApi): ReactElement;
  feature?: Entitlement;
}

export interface PluginNavItem extends Omit<NavItem, 'label'> {
  label: Label;
  feature?: Entitlement;
  order: number;
}

export interface PluginSettingsTab {
  value: string;
  label: Label;
  render(): ReactElement;
  feature?: Entitlement;
}

export interface PublicRoute {
  path: string;
  render(): ReactElement;
}

export interface HeaderProps {
  nav: readonly NavItem[];
  children: ReactNode;
}

export interface Plugin {
  name: string;
  routes?: PluginRoute[];
  nav?: PluginNavItem[];
  settingsTabs?: PluginSettingsTab[];
  publicRoutes?: PublicRoute[];
  signInPath?: string;
  header?: ComponentType<HeaderProps>;
}

export function compose(plugins: readonly Plugin[], features: ReadonlySet<Entitlement>) {
  const allowed = <T extends { feature?: Entitlement }>(item: T) =>
    !item.feature || features.has(item.feature);
  return {
    routes: plugins.flatMap((p) => p.routes ?? []).filter(allowed),
    nav: plugins
      .flatMap((p) => p.nav ?? [])
      .filter(allowed)
      .toSorted((a, b) => a.order - b.order)
      .map((item) => ({ ...item, label: labelText(item.label) })),
    settingsTabs: plugins
      .flatMap((p) => p.settingsTabs ?? [])
      .filter(allowed)
      .map((tab): SettingsTab => ({ ...tab, label: labelText(tab.label) })),
  };
}
