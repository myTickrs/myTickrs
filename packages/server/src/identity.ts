import type { Request as ExpressRequest, Router } from 'express';
import type { Entitlement } from '@tickrs/shared';
import { localPrincipal, type Ctx, type Principal } from './context.js';
import { AppError } from './errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    principal?: Principal;
  }
}

export interface Identity {
  mode: 'none' | 'session';
  principal(req: ExpressRequest): Principal | Promise<Principal>;
  routes?(api: Router): void;
}

export const localIdentity: Identity = {
  mode: 'none',
  principal: () => localPrincipal(),
};

export function principalOf(req: ExpressRequest): Principal {
  if (!req.principal) throw new AppError('UNAUTHORIZED', 401, 'Not signed in');
  return req.principal;
}

export function requireFeature(ctx: Ctx, feature: Entitlement): void {
  if (!ctx.principal.entitlements.has(feature)) {
    throw new AppError('FEATURE_NOT_AVAILABLE', 403, 'This feature is not included in your plan', {
      feature,
    });
  }
}
