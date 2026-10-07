import { PLUGIN_API_VERSION, type ProviderPlugin } from './contract.js';

export const PLUGIN_ID = /^[a-z][a-z0-9-]{1,31}$/;

const CAPABILITIES = ['search', 'quotes', 'history', 'corporateActions'] as const;

const positive = (v: unknown) => v == null || (Number.isInteger(v) && (v as number) >= 1);

export function validatePlugin(value: unknown): string[] {
  if (value == null || typeof value !== 'object') return ['default export is not an object'];
  const p = value as Partial<ProviderPlugin> & Record<string, unknown>;
  const problems: string[] = [];
  if (p.apiVersion !== PLUGIN_API_VERSION) problems.push(`apiVersion must be ${PLUGIN_API_VERSION}`);
  if (typeof p.id !== 'string' || !PLUGIN_ID.test(p.id)) problems.push(`id must match ${PLUGIN_ID}`);
  if (typeof p.name !== 'string' || p.name.trim() === '') problems.push('name is required');
  if (typeof p.version !== 'string' || !/^\d+\.\d+\.\d+/.test(p.version)) {
    problems.push('version must be semver');
  }
  const caps = p.capabilities as Record<string, unknown> | undefined;
  if (!caps || CAPABILITIES.some((c) => typeof caps[c] !== 'boolean')) {
    problems.push(`capabilities must set ${CAPABILITIES.join(', ')} to true or false`);
  }
  if (caps?.optionQuotes != null && typeof caps.optionQuotes !== 'boolean') {
    problems.push('capabilities.optionQuotes must be true or false when set');
  }
  if (p.limits != null) {
    const { perMinute, perDay, batch } = p.limits;
    if (!Number.isInteger(perMinute) || perMinute < 1) {
      problems.push('limits.perMinute must be a positive integer');
    }
    if (perDay != null && (!Number.isInteger(perDay) || perDay < 1)) {
      problems.push('limits.perDay must be a positive integer');
    }
    if (batch != null) {
      if (typeof batch !== 'object' || !positive(batch.quotes)) {
        problems.push('limits.batch.quotes must be a positive integer');
      }
      if (typeof batch === 'object' && batch.optionQuotes !== 'underlying' && !positive(batch.optionQuotes)) {
        problems.push("limits.batch.optionQuotes must be a positive integer or 'underlying'");
      }
    }
  }
  const auth = p.auth as { type?: unknown } | undefined;
  if (auth?.type !== 'apiKey' && auth?.type !== 'none') problems.push("auth.type must be 'apiKey' or 'none'");
  if (p.signupUrl != null && (typeof p.signupUrl !== 'string' || !p.signupUrl.startsWith('https://'))) {
    problems.push('signupUrl must be an https URL');
  }
  if (typeof p.description?.en !== 'string' || p.description.en.trim() === '') {
    problems.push('description.en is required');
  }
  if (typeof p.create !== 'function') problems.push('create must be a function');
  return problems;
}
