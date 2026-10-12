import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ServerConfig } from '../server-config.js';
import { AppError } from '../errors.js';

const ALGORITHM = 'aes-256-gcm';

export interface EncryptedKey {
  ciphertext: string;
  iv: string;
  authTag: string;
  hint: string;
}

export function resolveMasterKey(
  config: Pick<ServerConfig, 'keyEncryptionKey' | 'localKeyFile' | 'repoRoot'>,
): Buffer {
  if (config.keyEncryptionKey) {
    const key = Buffer.from(config.keyEncryptionKey, 'base64');
    if (key.length !== 32) {
      throw new AppError('CONFIG_ERROR', 500, 'KEY_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
    }
    return key;
  }
  if (!config.localKeyFile) {
    throw new AppError(
      'CONFIG_ERROR',
      500,
      'KEY_ENCRYPTION_KEY is required when keys may not be kept locally',
    );
  }
  const file = path.join(config.repoRoot, 'data', '.master-key');
  if (existsSync(file)) return Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
  const key = randomBytes(32);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, key.toString('base64'), { mode: 0o600 });
  return key;
}

export function encryptKey(masterKey: Buffer, apiKey: string): EncryptedKey {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    hint: apiKey.slice(-4),
  };
}

export function decryptKey(masterKey: Buffer, stored: Omit<EncryptedKey, 'hint'>): string {
  const decipher = createDecipheriv(ALGORITHM, masterKey, Buffer.from(stored.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(stored.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(stored.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
