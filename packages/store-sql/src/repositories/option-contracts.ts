import type { ContractRow, StoredAdjustmentRow as AdjustmentRow } from '@tickrs/server/store/ports.js';
import { type ContractAdjustment, effectiveContract, type EffectiveContract } from '@tickrs/core';
import {
  formatContractKey,
  normalizeStrike,
  type OccParts,
  type OptionSettlement,
  type OptionStyle,
} from '@tickrs/shared';
import type { Uuid } from '@tickrs/server/model.js';
import { newId, nowIso } from '@tickrs/server/ids.js';
import type { Executor } from './common.js';
import { normalizeRow } from './common.js';

export type { AdjustmentRow, ContractRow };

const CONTRACT_DECIMALS = ['strike', 'multiplier'] as const;
const ADJUSTMENT_DECIMALS = ['multiplier', 'deliverableShares', 'cashInLieu', 'strike'] as const;

export async function findContractById(db: Executor, id: Uuid) {
  const row = await db.selectFrom('optionContracts').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? normalizeRow(row, CONTRACT_DECIMALS) : undefined;
}

export async function findContractByKey(db: Executor, contractKey: string) {
  const row = await db
    .selectFrom('optionContracts')
    .selectAll()
    .where('contractKey', '=', contractKey)
    .executeTakeFirst();
  return row ? normalizeRow(row, CONTRACT_DECIMALS) : undefined;
}

export async function ensureContract(
  db: Executor,
  parts: OccParts & { multiplier?: string; style?: OptionStyle; settlement?: OptionSettlement },
): Promise<ContractRow> {
  const contractKey = formatContractKey(parts);
  const existing = await findContractByKey(db, contractKey);
  if (existing) return existing;
  await db
    .insertInto('optionContracts')
    .values({
      id: newId(),
      contractKey,
      underlyingSymbol: parts.underlying.toUpperCase(),
      expiration: parts.expiration,
      strike: normalizeStrike(parts.strike),
      optionRight: parts.right,
      ...(parts.multiplier ? { multiplier: parts.multiplier } : {}),
      ...(parts.style ? { style: parts.style } : {}),
      ...(parts.settlement ? { settlement: parts.settlement } : {}),
      createdAt: nowIso(),
    })
    .onConflict((oc) => oc.column('contractKey').doNothing())
    .execute();
  return (await findContractByKey(db, contractKey))!;
}

export async function listContracts(db: Executor, ids: readonly Uuid[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .selectFrom('optionContracts')
    .selectAll()
    .where('id', 'in', [...ids])
    .execute();
  return rows.map((r) => normalizeRow(r, CONTRACT_DECIMALS));
}

export async function listAdjustments(db: Executor, userId: Uuid, contractIds?: readonly Uuid[]) {
  let query = db.selectFrom('optionContractAdjustments').selectAll().where('userId', '=', userId);
  if (contractIds) {
    if (contractIds.length === 0) return [];
    query = query.where('optionContractId', 'in', [...contractIds]);
  }
  const rows = await query.execute();
  return rows.map((r) => normalizeRow(r, ADJUSTMENT_DECIMALS));
}

const toAdjustment = (row: AdjustmentRow | undefined): ContractAdjustment | undefined =>
  row
    ? {
        multiplier: row.multiplier,
        deliverableShares: row.deliverableShares,
        cashInLieu: row.cashInLieu,
        strike: row.strike,
        quoteSymbol: row.quoteSymbol,
        displayName: row.displayName,
      }
    : undefined;

export function buildContractMap(
  contracts: readonly ContractRow[],
  adjustments: readonly AdjustmentRow[],
): Map<string, EffectiveContract> {
  const byContract = new Map(adjustments.map((a) => [a.optionContractId, a]));
  const map = new Map<string, EffectiveContract>();
  for (const c of contracts) {
    map.set(
      c.id,
      effectiveContract(
        {
          id: c.id,
          underlying: c.underlyingSymbol,
          expiration: c.expiration,
          strike: c.strike,
          right: c.optionRight,
          multiplier: c.multiplier,
          style: c.style,
          settlement: c.settlement,
        },
        toAdjustment(byContract.get(c.id)),
      ),
    );
  }
  return map;
}

export async function loadContractMap(db: Executor, userId: Uuid, ids: readonly Uuid[]) {
  const [contracts, adjustments] = await Promise.all([
    listContracts(db, ids),
    listAdjustments(db, userId, ids),
  ]);
  return buildContractMap(contracts, adjustments);
}

export async function upsertAdjustment(
  db: Executor,
  userId: Uuid,
  optionContractId: Uuid,
  input: {
    multiplier?: string | null;
    deliverableShares?: string | null;
    cashInLieu?: string | null;
    strike?: string | null;
    quoteSymbol?: string | null;
    displayName?: string | null;
    note?: string | null;
  },
): Promise<void> {
  const now = nowIso();
  await db
    .insertInto('optionContractAdjustments')
    .values({
      userId,
      optionContractId,
      multiplier: input.multiplier ?? null,
      deliverableShares: input.deliverableShares ?? null,
      cashInLieu: input.cashInLieu ?? null,
      strike: input.strike ?? null,
      quoteSymbol: input.quoteSymbol ?? null,
      displayName: input.displayName ?? null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflict((oc) =>
      oc.columns(['userId', 'optionContractId']).doUpdateSet((eb) => ({
        multiplier: eb.ref('excluded.multiplier'),
        deliverableShares: eb.ref('excluded.deliverableShares'),
        cashInLieu: eb.ref('excluded.cashInLieu'),
        strike: eb.ref('excluded.strike'),
        quoteSymbol: eb.ref('excluded.quoteSymbol'),
        displayName: eb.ref('excluded.displayName'),
        note: eb.ref('excluded.note'),
        updatedAt: now,
      })),
    )
    .execute();
}

export async function deleteAdjustment(db: Executor, userId: Uuid, optionContractId: Uuid): Promise<void> {
  await db
    .deleteFrom('optionContractAdjustments')
    .where('userId', '=', userId)
    .where('optionContractId', '=', optionContractId)
    .execute();
}
