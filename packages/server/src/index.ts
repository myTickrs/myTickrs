export { createApp, type AppDeps } from './app.js';
export { capabilitiesOf } from './capabilities.js';
export {
  createContext,
  ENTITLEMENTS,
  localPrincipal,
  systemClock,
  type Clock,
  type Ctx,
  type Entitlement,
  type Principal,
} from './context.js';
export { AppError } from './errors.js';
export { localIdentity, principalOf, requireFeature, type Identity } from './identity.js';
export { LOCAL_DEFAULT_ACCOUNT_ID, LOCAL_USER_ID } from './local.js';
export { createLogger } from './logger.js';
export type { CloudSyncConfig, OAuthClientConfig, ServerConfig } from './server-config.js';
export type * from './store/ports.js';
