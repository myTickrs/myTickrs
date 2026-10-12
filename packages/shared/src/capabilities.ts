export const ENTITLEMENTS = [
  'advanced-charts',
  'multi-account',
  'sharing',
  'cloud-sync',
  'ai-import',
] as const;
export type Entitlement = (typeof ENTITLEMENTS)[number];

export const EDITIONS = ['desktop', 'cloud'] as const;
export type Edition = (typeof EDITIONS)[number];

export interface Capabilities {
  edition: Edition;
  auth: { mode: 'none' | 'session' };
  multiTenant: boolean;
  features: Entitlement[];
}
