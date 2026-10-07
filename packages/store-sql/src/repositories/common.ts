import { toDecimalString } from '@tickrs/core';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '@tickrs/server/model.js';

export type Executor = Kysely<Database> | Transaction<Database>;

export function normalizeRow<T extends Record<string, unknown>>(row: T, fields: readonly (keyof T)[]): T {
  const out = { ...row };
  for (const f of fields) {
    const v = out[f];
    if (typeof v === 'string') out[f] = toDecimalString(v) as T[keyof T];
  }
  return out;
}
