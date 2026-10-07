import type { Capabilities, Edition } from '@tickrs/shared';
import type { Ctx } from './context.js';

export function capabilitiesOf(ctx: Ctx, authMode: 'none' | 'session', edition: Edition): Capabilities {
  return {
    edition,
    auth: { mode: authMode },
    multiTenant: ctx.principal.tenantId !== undefined,
    features: [...ctx.principal.entitlements].toSorted(),
  };
}
