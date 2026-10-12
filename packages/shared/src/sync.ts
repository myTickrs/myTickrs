import { z } from 'zod';
import type { BackupCounts } from './backup.js';

export const SYNC_PATHS = {
  pushToCloud: '/api/v1/sync-local',
  pullFromCloud: '/api/v1/sync-cloud',
  status: '/api/v1/sync-status',
} as const;

export const SYNC_FINGERPRINT_HEADER = 'x-tickrs-fingerprint';

export type SyncStatus =
  { exists: false } | { exists: true; fingerprint: string; counts: BackupCounts; lastChangedAt?: string };

export interface SyncPushResult {
  fingerprint: string;
}

export const SYNC_DIRECTIONS = ['to-cloud', 'from-cloud'] as const;
export type SyncDirection = (typeof SYNC_DIRECTIONS)[number];

export const SIGN_IN_PROVIDERS = ['google', 'microsoft'] as const;
export type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number];

export const startCloudSyncSchema = z.object({
  provider: z.enum(SIGN_IN_PROVIDERS),
});
export type StartCloudSyncInput = z.infer<typeof startCloudSyncSchema>;

export const confirmCloudSyncSchema = z.object({
  direction: z.enum(SYNC_DIRECTIONS),
});
export type ConfirmCloudSyncInput = z.infer<typeof confirmCloudSyncSchema>;

export type SyncState = 'in-sync' | 'local-changed' | 'cloud-changed' | 'both-changed' | 'first-sync';

export interface SyncComparison {
  state: SyncState;
  suggested?: SyncDirection;
  lastSyncedAt?: string;
  local: { counts: BackupCounts; lastChangedAt?: string };
  cloud: { exists: boolean; counts?: BackupCounts; lastChangedAt?: string };
}

export interface SyncResult {
  exportedAt: string;
  now: BackupCounts;
  replaced?: BackupCounts;
}

export type CloudSyncStatus =
  | 'awaiting-sign-in'
  | 'comparing'
  | 'awaiting-confirm'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'expired';

export interface CloudSyncSession {
  id: string;
  direction?: SyncDirection;
  provider: SignInProvider;
  status: CloudSyncStatus;
  authorizeUrl?: string;
  expiresAt: string;
  account?: { email: string };
  comparison?: SyncComparison;
  result?: SyncResult;
  error?: { code: string; message: string };
}

export const CLOUD_SYNC_ENV_VARS = [
  'CLOUD_URL',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'MICROSOFT_OAUTH_CLIENT_ID',
] as const;
export type CloudSyncEnvVar = (typeof CLOUD_SYNC_ENV_VARS)[number];

export interface CloudSyncSettings {
  cloudUrl?: string;
  providers: SignInProvider[];
  unset: CloudSyncEnvVar[];
  lastSync?: { at: string; account: string };
}
