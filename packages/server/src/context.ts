import { ENTITLEMENTS, type Entitlement } from '@tickrs/shared';
import type { CryptoConfig } from './services/providers.js';
import type { Store, StoreTx } from './store/ports.js';
import type { IsoDate, IsoTimestamp, Uuid } from './model.js';
import { LOCAL_USER_ID } from './local.js';
import { nowIso } from './ids.js';

export { ENTITLEMENTS, type Entitlement };

export interface Principal {
  userId: Uuid;
  tenantId?: Uuid;
  entitlements: ReadonlySet<Entitlement>;
}

export interface Clock {
  today(): IsoDate;
  nowIso(): IsoTimestamp;
}

export const systemClock: Clock = {
  today: () => new Date().toISOString().slice(0, 10),
  nowIso,
};

export interface Ctx {
  store: Store;
  data: StoreTx;
  principal: Principal;
  crypto: CryptoConfig;
  clock: Clock;
}

export function localPrincipal(): Principal {
  return { userId: LOCAL_USER_ID as Uuid, entitlements: new Set(ENTITLEMENTS) };
}

export function createContext(options: {
  store: Store;
  crypto: CryptoConfig;
  principal?: Principal;
  clock?: Clock;
}): Ctx {
  const principal = options.principal ?? localPrincipal();
  const store = options.store;
  return {
    store,
    data: store.scope(principal),
    crypto: options.crypto,
    principal,
    clock: options.clock ?? systemClock,
  };
}
