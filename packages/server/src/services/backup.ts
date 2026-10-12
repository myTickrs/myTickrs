import { createHash } from 'node:crypto';
import { effectiveContract, type EffectiveContract, LedgerError, validateLedger } from '@tickrs/core';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupCounts,
  backupCounts,
  type BackupFile,
  backupSchema,
  formatContractKey,
} from '@tickrs/shared';
import type { Ctx } from '../context.js';
import { AppError } from '../errors.js';
import { nowIso } from '../ids.js';
import type { TxnRow, UserData } from '../store/ports.js';
import { loadCurrencies } from './currencies.js';
import { rowToLedgerTxn } from './ledger-context.js';

const keyOf = (c: BackupFile['optionContracts'][number]) =>
  formatContractKey({
    underlying: c.underlyingSymbol,
    expiration: c.expiration,
    strike: c.strike,
    right: c.optionRight,
  });

const invalid = (message: string, details?: unknown) => new AppError('INVALID_BACKUP', 422, message, details);

export async function exportBackup(ctx: Ctx): Promise<BackupFile> {
  await loadCurrencies(ctx.data);
  const data = await ctx.data.backup.read();
  const contractIds = [
    ...new Set([
      ...data.transactions.map((t) => t.optionContractId).filter((id): id is string => id != null),
      ...data.manualMarks.map((m) => m.optionContractId),
      ...data.contractAdjustments.map((a) => a.optionContractId),
    ]),
  ].toSorted();
  const contracts = (await Promise.all(contractIds.map((id) => ctx.data.contracts.find(id)))).filter(
    (c) => c != null,
  );
  const symbols = [
    ...new Set([...data.transactions.map((t) => t.symbol), ...contracts.map((c) => c.underlyingSymbol)]),
  ];
  const securities = (await ctx.data.securities.list(symbols)).toSorted((a, b) =>
    a.symbol < b.symbol ? -1 : 1,
  );

  return backupSchema.parse({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: nowIso(),
    settings: { ...data.settings, autoExpireOtm: data.settings.autoExpireOtm === 1 },
    currencies: data.currencies.map(({ code, name }) => ({ code, name })),
    feeSchedules: data.feeSchedules,
    accounts: data.accounts,
    securities: securities.map(({ symbol, exchange, name, currency, type, sector }) => ({
      symbol,
      exchange,
      name,
      currency,
      type,
      sector,
    })),
    optionContracts: contracts.map((c) => ({
      id: c.id,
      contractKey: c.contractKey,
      underlyingSymbol: c.underlyingSymbol,
      expiration: c.expiration,
      strike: c.strike,
      optionRight: c.optionRight,
      multiplier: c.multiplier,
      style: c.style,
      settlement: c.settlement,
    })),
    strategyGroups: data.strategyGroups,
    transactions: data.transactions,
    manualMarks: data.manualMarks,
    contractAdjustments: data.contractAdjustments,
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function backupFingerprint(file: BackupFile): string {
  const { exportedAt: _exportedAt, securities: _securities, ...owned } = file;
  const canonical = canonicalJson({
    ...owned,
    transactions: owned.transactions.filter((t) => t.isAutoExpired !== 1),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function lastChangedAt(file: BackupFile): string | undefined {
  const times = [
    ...[...file.feeSchedules, ...file.accounts, ...file.strategyGroups, ...file.transactions].flatMap((r) => [
      r.createdAt,
      r.updatedAt,
    ]),
    ...file.contractAdjustments.flatMap((a) => [a.createdAt, a.updatedAt]),
    ...file.manualMarks.map((m) => m.updatedAt),
  ];
  return times.length === 0 ? undefined : times.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
}

export function readBackupFile(text: string): BackupFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw invalid('This file is not a myTickrs backup: it is not valid JSON.');
  }
  const head = json as { format?: unknown; version?: unknown } | null;
  if (typeof head !== 'object' || head === null || head.format !== BACKUP_FORMAT) {
    throw invalid('This file is not a myTickrs backup.');
  }
  if (head.version !== BACKUP_VERSION) {
    throw invalid(
      `This backup uses format version ${String(head.version)}; this version of myTickrs reads version ${BACKUP_VERSION}.`,
    );
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw invalid(`This backup is damaged: ${issue.path.join('.') || 'file'}: ${issue.message}.`, {
      issues: parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  const file = parsed.data;
  checkReferences(file);
  checkLedgers(file);
  return file;
}

function checkReferences(file: BackupFile): void {
  const unique = (what: string, keys: readonly string[]) => {
    const seen = new Set<string>();
    for (const key of keys) {
      if (seen.has(key)) throw invalid(`This backup is damaged: ${what} ${key} appears twice.`);
      seen.add(key);
    }
    return seen;
  };
  const currencies = unique(
    'currency',
    file.currencies.map((c) => c.code),
  );
  const feeSchedules = unique(
    'fee schedule',
    file.feeSchedules.map((f) => f.id),
  );
  const accounts = unique(
    'account',
    file.accounts.map((a) => a.id),
  );
  const securities = unique(
    'security',
    file.securities.map((s) => s.symbol),
  );
  const contracts = unique(
    'option contract',
    file.optionContracts.map((c) => c.id),
  );
  unique(
    'option contract',
    file.optionContracts.map((c) => keyOf(c)),
  );
  const groups = unique(
    'strategy group',
    file.strategyGroups.map((g) => g.id),
  );
  const txns = unique(
    'transaction',
    file.transactions.map((t) => t.id),
  );
  unique(
    'manual mark for contract',
    file.manualMarks.map((m) => m.optionContractId),
  );
  unique(
    'adjustment for contract',
    file.contractAdjustments.map((a) => a.optionContractId),
  );

  const need = (ok: boolean, message: string) => {
    if (!ok) throw invalid(`This backup is damaged: ${message}.`);
  };
  need(
    currencies.has(file.settings.baseCurrency),
    `the base currency ${file.settings.baseCurrency} is not in its currency list`,
  );
  for (const a of file.accounts) {
    need(
      currencies.has(a.currency),
      `account ${a.id} is in ${a.currency}, which is not in its currency list`,
    );
    need(
      a.feeScheduleId == null || feeSchedules.has(a.feeScheduleId),
      `account ${a.id} names a missing fee schedule`,
    );
  }
  for (const c of file.optionContracts) {
    need(securities.has(c.underlyingSymbol), `option contract ${keyOf(c)} names a missing security`);
  }
  for (const t of file.transactions) {
    need(accounts.has(t.accountId), `transaction ${t.id} belongs to a missing account`);
    need(
      currencies.has(t.currency),
      `transaction ${t.id} is in ${t.currency}, which is not in its currency list`,
    );
    need(t.symbol == null || securities.has(t.symbol), `transaction ${t.id} names a missing security`);
    need(
      t.optionContractId == null || contracts.has(t.optionContractId),
      `transaction ${t.id} names a missing option contract`,
    );
    need(
      t.linkedTxnId == null || txns.has(t.linkedTxnId),
      `transaction ${t.id} is linked to a missing transaction`,
    );
    need(
      t.strategyGroupId == null || groups.has(t.strategyGroupId),
      `transaction ${t.id} names a missing strategy group`,
    );
  }
  for (const m of [...file.manualMarks, ...file.contractAdjustments]) {
    need(contracts.has(m.optionContractId), `a mark or adjustment names a missing option contract`);
  }
}

const byLedgerOrder = (a: TxnRow, b: TxnRow) =>
  a.tradeDate !== b.tradeDate
    ? a.tradeDate < b.tradeDate
      ? -1
      : 1
    : a.createdAt !== b.createdAt
      ? a.createdAt < b.createdAt
        ? -1
        : 1
      : a.id < b.id
        ? -1
        : 1;

function checkLedgers(file: BackupFile): void {
  const adjustments = new Map(file.contractAdjustments.map((a) => [a.optionContractId, a]));
  const contracts = new Map<string, EffectiveContract>(
    file.optionContracts.map((c) => [
      c.id,
      effectiveContract(
        {
          id: c.id,
          underlying: c.underlyingSymbol,
          expiration: c.expiration,
          strike: c.strike,
          right: c.optionRight,
          multiplier: c.multiplier,
        },
        adjustments.get(c.id),
      ),
    ]),
  );
  const opts = {
    baseCurrency: file.settings.baseCurrency,
    averagePriceScope: file.settings.averagePriceScope,
    premiumTreatment: file.settings.optionPremiumTreatment,
    borrowFeeTreatment: file.settings.borrowFeeTreatment,
    contracts,
  };
  for (const account of file.accounts) {
    const rows = file.transactions.filter((t) => t.accountId === account.id).toSorted(byLedgerOrder);
    const error = validateLedger(rows.map(rowToLedgerTxn), opts);
    if (error instanceof LedgerError) {
      throw invalid(
        `This backup cannot be restored: in account "${account.name}", transaction ${error.txnId} does not replay (${error.message}).`,
        { accountId: account.id, txnId: error.txnId, code: error.code },
      );
    }
  }
}

export interface RestoreResult {
  restored: boolean;
  exportedAt: string;
  current: BackupCounts;
  backup: BackupCounts;
}

export async function restoreBackup(ctx: Ctx, text: string, confirm: boolean): Promise<RestoreResult> {
  const file = readBackupFile(text);
  const summary = {
    exportedAt: file.exportedAt,
    current: backupCounts(await ctx.data.backup.read()),
    backup: backupCounts(file),
  };
  if (!confirm) return { restored: false, ...summary };

  await ctx.store.transaction(ctx.principal, async (tx) => {
    for (const s of file.securities) {
      await tx.securities.ensure(s.symbol, {
        currency: s.currency,
        name: s.name,
        type: s.type,
        exchange: s.exchange,
      });
    }
    const contractId = new Map<string, string>();
    for (const c of file.optionContracts) {
      const row = await tx.contracts.ensure({
        underlying: c.underlyingSymbol,
        expiration: c.expiration,
        strike: c.strike,
        right: c.optionRight,
        multiplier: c.multiplier,
        style: c.style,
        settlement: c.settlement,
      });
      contractId.set(c.id, row.id);
    }
    const mapContract = (id: string) => contractId.get(id)!;

    const data: UserData = {
      settings: { ...file.settings, autoExpireOtm: file.settings.autoExpireOtm ? 1 : 0 },
      currencies: file.currencies.map((c) => ({ ...c, createdAt: nowIso() })),
      feeSchedules: file.feeSchedules,
      accounts: file.accounts,
      strategyGroups: file.strategyGroups,
      transactions: file.transactions.map((t) => ({
        ...t,
        optionContractId: t.optionContractId ? mapContract(t.optionContractId) : null,
      })),
      manualMarks: file.manualMarks.map((m) => ({ ...m, optionContractId: mapContract(m.optionContractId) })),
      contractAdjustments: file.contractAdjustments.map((a) => ({
        ...a,
        optionContractId: mapContract(a.optionContractId),
      })),
    };
    await tx.backup.replace(data);
  });
  return { restored: true, ...summary };
}
