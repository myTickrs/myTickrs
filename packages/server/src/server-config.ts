import type { CloudSyncEnvVar, SignInProvider } from '@tickrs/shared';

export interface ServerConfig {
  env: 'development' | 'test' | 'production';
  logLevel: string;
  localKeyFile: boolean;
  repoRoot: string;
  keyEncryptionKey: string | undefined;
  cloudSync?: CloudSyncConfig;
  cloudSyncUnset?: CloudSyncEnvVar[];
  appsDir?: string;
  marketDataBaseProvider?: string;
}

export interface CloudSyncConfig {
  cloudUrl: string;
  providers: Partial<Record<SignInProvider, OAuthClientConfig>>;
}

export interface OAuthClientConfig {
  clientId: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
  issuer: RegExp;
}
