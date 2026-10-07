import { appendFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { CloudSyncConfig } from '@tickrs/server/server-config.js';
import { CLOUD_SYNC_ENV_VARS, type CloudSyncEnvVar } from '@tickrs/shared';
import { z } from 'zod';

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  );

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5051),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    SQLITE_PATH: z.string().min(1).default('./data/tickrs.db'),
    ERROR_LOG_DIR: z.string().default('./logs'),
    ERROR_LOG_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
    AUTH_MODE: z.string().optional(),
    KEY_ENCRYPTION_KEY: z.string().optional(),
    MARKET_DATA_BASE_PROVIDER: z.string().optional(),
    CLOUD_URL: optional(z.string().url()),
    GOOGLE_OAUTH_CLIENT_ID: optional(z.string()),
    GOOGLE_OAUTH_CLIENT_SECRET: optional(z.string()),
    MICROSOFT_OAUTH_CLIENT_ID: optional(z.string()),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_MODE !== undefined && env.AUTH_MODE !== 'none') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message:
          'the desktop edition has no sign-in, so AUTH_MODE can only be "none" (or unset). Signing in is part of the myTickrs cloud service',
      });
    }
    const hasProvider = Boolean(env.GOOGLE_OAUTH_CLIENT_ID || env.MICROSOFT_OAUTH_CLIENT_ID);
    if (env.CLOUD_URL !== undefined) {
      const url = URL.parse(env.CLOUD_URL);
      const local = url?.hostname === 'localhost' || url?.hostname === '127.0.0.1';
      if (url && url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
        ctx.addIssue({
          code: 'custom',
          path: ['CLOUD_URL'],
          message: 'must be https (plain http is accepted only for localhost, in development)',
        });
      }
      if (!hasProvider) {
        ctx.addIssue({
          code: 'custom',
          path: ['CLOUD_URL'],
          message:
            'set GOOGLE_OAUTH_CLIENT_ID (with GOOGLE_OAUTH_CLIENT_SECRET) or MICROSOFT_OAUTH_CLIENT_ID too, so sync has a way to sign in',
        });
      }
    } else if (hasProvider) {
      ctx.addIssue({
        code: 'custom',
        path: ['CLOUD_URL'],
        message: 'is needed when a sign-in client ID is set: it is the cloud to sync with',
      });
    }
    if (env.GOOGLE_OAUTH_CLIENT_ID && !env.GOOGLE_OAUTH_CLIENT_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_OAUTH_CLIENT_SECRET'],
        message:
          'is required with GOOGLE_OAUTH_CLIENT_ID: Google issues one to desktop clients and wants it back',
      });
    }
  });

const GOOGLE = {
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  issuer: /^(https:\/\/)?accounts\.google\.com$/,
};
const MICROSOFT = {
  authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  issuer: /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/,
};

function cloudSyncOf(env: z.infer<typeof envSchema>): CloudSyncConfig | undefined {
  if (!env.CLOUD_URL) return undefined;
  const providers: CloudSyncConfig['providers'] = {};
  if (env.GOOGLE_OAUTH_CLIENT_ID) {
    providers.google = {
      ...GOOGLE,
      clientId: env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    };
  }
  if (env.MICROSOFT_OAUTH_CLIENT_ID) {
    providers.microsoft = { ...MICROSOFT, clientId: env.MICROSOFT_OAUTH_CLIENT_ID };
  }
  return { cloudUrl: env.CLOUD_URL.replace(/\/+$/, ''), providers };
}

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: string;
  errorLog: { dir: string; days: number } | null;
  localKeyFile: true;
  repoRoot: string;
  db: { sqlitePath: string };
  keyEncryptionKey: string | undefined;
  cloudSync: CloudSyncConfig | undefined;
  cloudSyncUnset: CloudSyncEnvVar[];
  appsDir: string;
  marketDataBaseProvider: string | undefined;
}

export const APPS_DIR = path.resolve(import.meta.dirname, '../..');

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function parseConfig(rawEnv: Record<string, string | undefined>, repoRoot: string): AppConfig {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const details = result.error.issues.map((i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`);
    throw new ConfigError(`Invalid configuration:\n${details.join('\n')}`);
  }
  const env = result.data;
  return {
    env: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    errorLog: env.ERROR_LOG_DIR.trim()
      ? { dir: path.resolve(repoRoot, env.ERROR_LOG_DIR.trim()), days: env.ERROR_LOG_DAYS }
      : null,
    localKeyFile: true,
    repoRoot,
    db: {
      sqlitePath: env.SQLITE_PATH === ':memory:' ? ':memory:' : path.resolve(repoRoot, env.SQLITE_PATH),
    },
    keyEncryptionKey: env.KEY_ENCRYPTION_KEY,
    cloudSync: cloudSyncOf(env),
    cloudSyncUnset: CLOUD_SYNC_ENV_VARS.filter((name) => !env[name]),
    appsDir: APPS_DIR,
    marketDataBaseProvider: env.MARKET_DATA_BASE_PROVIDER?.trim(),
  };
}

export const ROOT_DIR = path.dirname(APPS_DIR);

const DESKTOP_CLOUD_SYNC_DEFAULTS: Record<CloudSyncEnvVar, string> = {
  CLOUD_URL: 'https://mytickrs.app',
  GOOGLE_OAUTH_CLIENT_ID: '785211414754-dufdtc2oibd7jcqqgukp8rjt0upk7jhk.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: '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',
  MICROSOFT_OAUTH_CLIENT_ID: '5bc65ea1-fe0a-43c8-9384-1c59c2d062a6',
};

function assigns(text: string, name: string, orCommented = false): boolean {
  return new RegExp(`^\\s*${orCommented ? '(#\\s*)?' : ''}${name}\\s*=`, 'm').test(text);
}

export function prepareEnvFile(envFile: string): void {
  if (process.env.NODE_ENV !== 'production') return;
  const exampleFile = path.join(path.dirname(envFile), '.env.example');
  const example = existsSync(exampleFile) ? readFileSync(exampleFile, 'utf8') : '';
  if (!existsSync(envFile) && example !== '') copyFileSync(exampleFile, envFile);
  let text = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  const append = (heading: string, lines: string[]) => {
    if (lines.length === 0) return;
    const separator = text === '' || text.endsWith('\n') ? '' : '\n';
    const block = `${separator}\n# ${heading}\n${lines.join('\n')}\n`;
    appendFileSync(envFile, block);
    text += block;
  };

  const fromExample = example.split(/\r?\n/).filter((line) => {
    const name = /^\s*([A-Za-z_]\w*)\s*=/.exec(line)?.[1];
    return name !== undefined && process.env[name] === undefined && !assigns(text, name, true);
  });
  append(
    'From .env.example (added on start)',
    fromExample.map((line) => line.trim()),
  );

  const missing = CLOUD_SYNC_ENV_VARS.filter(
    (name) =>
      DESKTOP_CLOUD_SYNC_DEFAULTS[name] !== '' && process.env[name] === undefined && !assigns(text, name),
  );
  append(
    'Sync with myTickrs cloud (added on start)',
    missing.map((name) => `${name}=${DESKTOP_CLOUD_SYNC_DEFAULTS[name]}`),
  );
}

export function loadConfig(): AppConfig {
  const repoRoot = ROOT_DIR;
  const envFile = path.join(repoRoot, '.env');
  prepareEnvFile(envFile);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  return parseConfig(process.env, repoRoot);
}
