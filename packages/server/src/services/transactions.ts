import type { StoreTx } from '../store/ports.js';
import type { Clock, Ctx } from '../context.js';
import {
  calculateFee,
  dec,
  type EffectiveContract,
  type FeeBreakdown,
  type FeeSchedule,
  isCashSettled,
  LedgerError,
  type LedgerTxn,
  linkedStockTrade,
  replay,
} from '@tickrs/core';
import {
  type CreateTransactionInput,
  EDITABLE_TYPE_FAMILIES,
  isIndexSymbol,
  isOpeningTrade,
  type FeeSource,
  parseOptionSymbol,
  type ShortBuyHandling,
  type TransactionQuery,
  type UpdateTransactionInput,
} from '@tickrs/shared';
import type { Uuid } from '../model.js';
import { AppError } from '../errors.js';
import { loadRegistry } from './markets.js';
import { ensureOptionContract, ensureUnderlying, resolveUnderlying } from './option-contracts.js';
import { newId, nowIso } from '../ids.js';
import type { AccountRow } from '../store/ports.js';
import type { NewTxnRow, TxnRow } from '../store/ports.js';
import {
  loadLedgerContext,
  rowToLedgerTxn,
  toTransactionDto,
  type TransactionDto,
  type UserRow,
} from './ledger-context.js';

const TRADE_TYPES = new Set([
  'BUY',
  'SELL',
  'SELL_SHORT',
  'BUY_TO_COVER',
  'BTO',
  'STO',
  'BTC',
  'STC',
  'ASN',
  'EXR',
]);

const regulatoryTotal = (b: FeeBreakdown): string => dec(b.secFee).plus(b.taf).plus(b.orf).toFixed();

export function settlementPriceRequired(underlying: string): AppError {
  return new AppError(
    'SETTLEMENT_PRICE_REQUIRED',
    422,
    `Enter the settlement price: options on ${underlying} are settled in cash`,
    { issues: [{ path: 'price', message: 'Enter the settlement price' }] },
  );
}

function mapLedgerError(err: LedgerError, ownIds: ReadonlySet<string>): AppError {
  if (ownIds.has(err.txnId)) {
    return new AppError(err.code, 422, err.message, { txnId: err.txnId });
  }
  return new AppError(
    'WOULD_BREAK_HISTORY',
    409,
    `This change would make a later transaction invalid: ${err.message}`,
    { txnId: err.txnId, cause: err.code },
  );
}

export interface BuildCache {
  instruments: Map<string, ResolvedInstrument>;
  feeSchedule?: FeeSchedule;
}

export const newBuildCache = (): BuildCache => ({ instruments: new Map() });

function instrumentKey(input: CreateTransactionInput): string {
  if ('optionContractId' in input) return `id:${input.optionContractId}`;
  if ('occSymbol' in input) return `occ:${input.occSymbol.toUpperCase()}|${input.multiplier ?? ''}`;
  if ('contract' in input) {
    const c = input.contract;
    return `c:${c.underlying}|${c.expiration}|${c.strike}|${c.right}|${c.multiplier ?? ''}`;
  }
  return `s:${input.symbol}`;
}

interface ResolvedInstrument {
  symbol: string;
  currency: string;
  contract?: EffectiveContract;
  optionContractId: Uuid | null;
  usListing: boolean;
}

function currencyMismatch(symbol: string, currency: string, accountCurrency: string): AppError {
  return new AppError(
    'CURRENCY_MISMATCH',
    422,
    `${symbol}'s currency (${currency}) does not match this account's currency (${accountCurrency}). Record it in a ${currency} account.`,
    { symbol, currency, accountCurrency },
  );
}

async function resolveInstrument(
  data: StoreTx,
  accountCurrency: string,
  input: CreateTransactionInput,
): Promise<ResolvedInstrument> {
  const registry = await loadRegistry(data);
  if (input.assetClass === 'STOCK') {
    if (isIndexSymbol(input.symbol)) {
      throw new AppError(
        'INDEX_NOT_TRADABLE',
        422,
        `${input.symbol} is an index: only its options can be recorded`,
        {
          symbol: input.symbol,
        },
      );
    }
    const mismatch = (currency: string) => currencyMismatch(input.symbol, currency, accountCurrency);
    const wanted = 'currency' in input ? input.currency : undefined;
    if (wanted && wanted !== accountCurrency) throw mismatch(wanted);
    const existing = await data.securities.find(input.symbol);
    if (existing && existing.currency !== accountCurrency) throw mismatch(existing.currency);
    const listed =
      !existing && registry.split(input.symbol).suffix ? registry.currencyOf(input.symbol) : null;
    if (listed && listed !== accountCurrency) throw mismatch(listed);
    const security = existing ?? (await data.securities.ensure(input.symbol, { currency: accountCurrency }));
    return {
      symbol: security.symbol,
      currency: security.currency,
      optionContractId: null,
      usListing: registry.marketOf(security.symbol)?.country === 'US',
    };
  }

  let contractId: Uuid;
  if ('optionContractId' in input) {
    const row = await data.contracts.find(input.optionContractId);
    if (!row) throw new AppError('NOT_FOUND', 404, 'No such option contract');
    contractId = row.id;
  } else {
    const written = 'occSymbol' in input ? parseOptionSymbol(input.occSymbol) : input.contract;
    if (!written) throw new AppError('VALIDATION_FAILED', 422, `Could not read the option symbol`);
    const terms = 'occSymbol' in input ? input : input.contract;
    const parts = {
      underlying: resolveUnderlying(registry, written.underlying, accountCurrency),
      expiration: written.expiration,
      strike: written.strike,
      right: written.right,
    };
    const row = await ensureOptionContract(data, registry, parts, {
      multiplier: terms.multiplier,
      style: terms.style,
      settlement: terms.settlement,
    });
    contractId = row.id;
  }
  const map = await data.contracts.effective([contractId]);
  const contract = map.get(contractId)!;
  const underlying = await ensureUnderlying(data, registry, contract.underlying);
  if (underlying.currency !== accountCurrency) {
    throw currencyMismatch(contract.underlying, underlying.currency, accountCurrency);
  }
  return {
    symbol: contract.underlying,
    currency: underlying.currency,
    optionContractId: contractId,
    contract,
    usListing: registry.marketOf(contract.underlying)?.country === 'US',
  };
}

async function resolveFee(
  data: StoreTx,
  feeScheduleId: Uuid | null,
  input: { type: string; quantity?: string; price?: string; fee?: string; feeSource?: FeeSource },
  multiplier?: string,
  cache?: BuildCache,
  usListing = true,
): Promise<{ fee: string; feeSource: FeeSource; breakdown: FeeBreakdown | null }> {
  if (input.fee !== undefined) {
    return { fee: input.fee, feeSource: input.feeSource ?? 'MANUAL', breakdown: null };
  }
  if (!TRADE_TYPES.has(input.type)) return { fee: '0', feeSource: 'AUTO', breakdown: null };
  if (cache && cache.feeSchedule === undefined) {
    cache.feeSchedule = data.feeSchedules.toSchedule(await data.feeSchedules.find(feeScheduleId));
  }
  const schedule =
    cache?.feeSchedule ?? data.feeSchedules.toSchedule(await data.feeSchedules.find(feeScheduleId));
  const breakdown = calculateFee(schedule, {
    type: input.type as Parameters<typeof calculateFee>[1]['type'],
    quantity: input.quantity ?? '0',
    price: input.price ?? '0',
    multiplier,
    usListing,
  });
  return { fee: breakdown.total, feeSource: 'AUTO', breakdown };
}

export function assertNotFuture(clock: Clock, tradeDate: string): void {
  if (tradeDate > clock.today()) {
    throw new AppError('FUTURE_DATE', 422, 'The trade date cannot be in the future', { tradeDate });
  }
}

const OPTION_TRADES = new Set(['BTO', 'STO', 'BTC', 'STC']);

export function assertNotAfterExpiration(
  type: string,
  tradeDate: string,
  contract: { expiration: string } | undefined,
): void {
  if (!contract || !OPTION_TRADES.has(type) || tradeDate <= contract.expiration) return;
  throw new AppError(
    'AFTER_EXPIRATION',
    422,
    `The trade date (${tradeDate}) is after the option's expiration (${contract.expiration})`,
    {
      tradeDate,
      expiration: contract.expiration,
      issues: [{ path: 'tradeDate', message: 'The trade date cannot be after the expiration date' }],
    },
  );
}

export function validate(
  txns: LedgerTxn[],
  opts: Parameters<typeof replay>[1],
  ownIds: ReadonlySet<string>,
  confirmNegativeStock = false,
  shortBuyHandling: ShortBuyHandling = 'COVER',
): void {
  let ledger;
  try {
    ledger = replay(txns, opts);
  } catch (err) {
    if (err instanceof LedgerError) throw mapLedgerError(err, ownIds);
    throw err;
  }
  if (shortBuyHandling === 'BLOCK') {
    const cover = ledger.warnings.find((w) => w.code === 'BUY_COVERS_SHORT' && ownIds.has(w.txnId));
    if (cover) throw new AppError('USE_BUY_TO_COVER', 422, cover.message, { txnId: cover.txnId });
  }
  const negative = ledger.warnings.find((w) => w.code === 'NEGATIVE_STOCK' && ownIds.has(w.txnId));
  if (negative && !confirmNegativeStock) {
    throw new AppError('CONFIRMATION_REQUIRED', 409, negative.message, {
      txnId: negative.txnId,
      confirm: 'confirmNegativeStock',
    });
  }
}

export interface BuildDeps {
  tx: StoreTx;
  user: UserRow;
  account: AccountRow;
  ledgerCtx: Awaited<ReturnType<typeof loadLedgerContext>>;
  cache: BuildCache;
}

export async function buildTransactionRows(
  deps: BuildDeps,
  input: CreateTransactionInput & { feeSource?: FeeSource },
): Promise<NewTxnRow[]> {
  const { tx, account, ledgerCtx, cache } = deps;

  const key = instrumentKey(input);
  let instrument = cache.instruments.get(key);
  if (!instrument) {
    instrument = await resolveInstrument(tx, account.currency, input);
    cache.instruments.set(key, instrument);
  }
  if (instrument.contract) ledgerCtx.contracts.set(instrument.contract.id, instrument.contract);
  assertNotAfterExpiration(input.type, input.tradeDate, instrument.contract);

  const quantity = 'quantity' in input ? input.quantity : undefined;
  const price = 'price' in input ? input.price : undefined;
  const realizedBefore = 'realizedBefore' in input ? input.realizedBefore : undefined;
  if (realizedBefore != null && !isOpeningTrade(input.type)) {
    throw new AppError('VALIDATION_FAILED', 422, 'Only an opening trade carries realized P&L from before', {
      fieldErrors: { realizedBefore: 'Only on a buy, sell short, buy to open or sell to open' },
    });
  }
  const { fee, feeSource, breakdown } = await resolveFee(
    tx,
    account.feeScheduleId,
    {
      type: input.type,
      quantity,
      price,
      fee: 'fee' in input ? input.fee : undefined,
      feeSource: input.feeSource,
    },
    instrument.contract?.multiplier,
    cache,
    instrument.usListing,
  );

  const now = nowIso();
  const id = newId();
  const base: NewTxnRow = {
    id,
    accountId: account.id,
    assetClass: input.assetClass,
    symbol: instrument.symbol,
    optionContractId: instrument.optionContractId,
    type: input.type,
    tradeDate: input.tradeDate,
    quantity: quantity ?? null,
    price: price ?? null,
    fee,
    feeSource,
    feeCommission: breakdown?.commission ?? null,
    feeRegulatory: breakdown ? regulatoryTotal(breakdown) : null,
    realizedBefore: realizedBefore ?? null,
    amount: 'amount' in input ? input.amount : null,
    splitFrom: 'splitFrom' in input ? input.splitFrom : null,
    splitTo: 'splitTo' in input ? input.splitTo : null,
    currency: instrument.currency,
    linkedTxnId: null,
    isSystemGenerated: 0,
    isAutoExpired: 0,
    strategyGroupId: null,
    strategyTag: null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };

  if (input.type !== 'ASN' && input.type !== 'EXR') return [base];

  const contract = instrument.contract!;
  if (isCashSettled(contract)) {
    if (price == null) throw settlementPriceRequired(contract.underlying);
    return [base];
  }
  base.price = null;
  const event: LedgerTxn = {
    id,
    assetClass: 'OPTION',
    type: input.type,
    tradeDate: input.tradeDate,
    symbol: contract.underlying,
    optionContractId: contract.id,
    quantity: 'quantity' in input ? input.quantity : undefined,
    price: '0',
    fee,
  };
  const generated = linkedStockTrade(event, contract);
  const stockId = newId();
  return [
    { ...base, linkedTxnId: stockId },
    {
      ...base,
      id: stockId,
      assetClass: 'STOCK',
      type: generated.type,
      optionContractId: null,
      quantity: generated.quantity ?? null,
      price: generated.price ?? null,
      amount: generated.amount ?? null,
      fee: '0',
      feeSource: 'AUTO',
      feeCommission: null,
      feeRegulatory: null,
      realizedBefore: null,
      linkedTxnId: id,
      isSystemGenerated: 1,
      notes: null,
    },
  ];
}

export async function insertRows(tx: StoreTx, rows: readonly NewTxnRow[]): Promise<void> {
  const linked = rows.filter((r) => r.linkedTxnId != null && r.isSystemGenerated !== 1);
  if (linked.length === 0) {
    await tx.transactions.insertMany([...rows]);
    return;
  }
  await tx.transactions.insertMany(
    rows.map((r) => (r.isSystemGenerated === 1 ? r : { ...r, linkedTxnId: null })),
  );
  for (const row of linked) {
    await tx.transactions.update(row.id as string, { linkedTxnId: row.linkedTxnId as string });
  }
}

export async function createTransaction(
  ctx: Ctx,
  input: CreateTransactionInput,
  options: { autoExpired?: boolean } = {},
): Promise<TransactionDto[]> {
  assertNotFuture(ctx.clock, input.tradeDate);
  return ctx.store.transaction(ctx.principal, async (tx) => {
    const user = await tx.users.require();
    const account = await tx.accounts.require(input.accountId, true);
    const ledgerCtx = await loadLedgerContext(tx, { accountId: account.id, user });
    const deps: BuildDeps = { tx, user, account, ledgerCtx, cache: newBuildCache() };
    const built = await buildTransactionRows(deps, input);
    const rows = options.autoExpired ? built.map((r) => ({ ...r, isAutoExpired: 1 as const })) : built;

    const ownIds = new Set(rows.map((r) => r.id as string));
    const pending = rows.map((r) => rowToLedgerTxn(r as TxnRow));
    const confirmNegative = 'confirmNegativeStock' in input && input.confirmNegativeStock === true;
    validate([...ledgerCtx.txns, ...pending], ledgerCtx.opts, ownIds, confirmNegative, user.shortBuyHandling);

    await insertRows(tx, rows);
    await tx.snapshots.invalidateFrom(account.id, input.tradeDate);

    const saved = await Promise.all(rows.map((r) => tx.transactions.find(r.id as string)));
    return saved.filter((r): r is TxnRow => r != null).map((r) => toTransactionDto(r, ledgerCtx.contracts));
  });
}

function indexed(error: unknown, find: (details: { txnId?: string }) => number | undefined): unknown {
  if (!(error instanceof AppError)) return error;
  const details = (error.details ?? {}) as { txnId?: string; index?: number };
  if (details.index != null) return error;
  const index = find(details);
  return index == null ? error : new AppError(error.code, error.status, error.message, { ...details, index });
}

async function withIndex<T>(index: number, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw indexed(error, () => index);
  }
}

class DryRun extends Error {}

export async function checkTransactions(
  ctx: Ctx,
  accountId: Uuid,
  inputs: readonly (CreateTransactionInput & { feeSource?: FeeSource })[],
): Promise<AppError | null> {
  if (inputs.length === 0) return null;
  try {
    await createTransactions(ctx, accountId, inputs, { dryRun: true });
    return null;
  } catch (error) {
    if (error instanceof DryRun) return null;
    if (error instanceof AppError) return error;
    throw error;
  }
}

export interface BatchResult {
  inserted: number;
  generated: number;
  from: string;
  to: string;
  symbols: string[];
}

export async function createTransactions(
  ctx: Ctx,
  accountId: Uuid,
  inputs: readonly (CreateTransactionInput & { feeSource?: FeeSource })[],
  options: { dryRun?: boolean } = {},
): Promise<BatchResult> {
  if (inputs.length === 0) throw new AppError('VALIDATION_FAILED', 422, 'There is nothing to import');
  for (const input of inputs) assertNotFuture(ctx.clock, input.tradeDate);

  return ctx.store.transaction(ctx.principal, async (tx) => {
    const user = await tx.users.require();
    const account = await tx.accounts.require(accountId, true);
    const ledgerCtx = await loadLedgerContext(tx, { accountId: account.id, user });
    const deps: BuildDeps = { tx, user, account, ledgerCtx, cache: newBuildCache() };

    const rows: NewTxnRow[] = [];
    const cameFrom = new Map<string, number>();
    for (const [index, input] of inputs.entries()) {
      if (input.accountId !== account.id) {
        throw new AppError('VALIDATION_FAILED', 422, 'Every row of an import must be in one account');
      }
      const built = await withIndex(index, () => buildTransactionRows(deps, input));
      for (const row of built) cameFrom.set(row.id as string, index);
      rows.push(...built);
    }

    const ownIds = new Set(rows.map((r) => r.id as string));
    const pending = rows.map((r) => rowToLedgerTxn(r as TxnRow));
    try {
      validate([...ledgerCtx.txns, ...pending], ledgerCtx.opts, ownIds, true);
    } catch (error) {
      throw indexed(error, (details) => cameFrom.get(details.txnId ?? ''));
    }

    if (options.dryRun) throw new DryRun();

    await insertRows(tx, rows);
    const dates = rows.map((r) => r.tradeDate as string).toSorted();
    await tx.snapshots.invalidateFrom(account.id, dates[0]!);

    return {
      inserted: rows.length,
      generated: rows.filter((r) => r.isSystemGenerated === 1).length,
      from: dates[0]!,
      to: dates.at(-1)!,
      symbols: [...new Set(rows.map((r) => r.symbol).filter((x): x is string => x != null))],
    };
  });
}

export async function updateTransaction(
  ctx: Ctx,
  id: Uuid,
  patch: UpdateTransactionInput,
): Promise<TransactionDto[]> {
  if (patch.tradeDate) assertNotFuture(ctx.clock, patch.tradeDate);
  return ctx.store.transaction(ctx.principal, async (tx) => {
    const user = await tx.users.require();
    const row = await tx.transactions.find(id);
    if (!row) throw new AppError('NOT_FOUND', 404, 'No such transaction');
    if (row.isSystemGenerated === 1) {
      throw new AppError(
        'LINKED_TRANSACTION',
        409,
        'This stock trade was created by an assignment or exercise. Edit that option event instead.',
        { editInstead: row.linkedTxnId },
      );
    }
    const source = await tx.accounts.require(row.accountId, true);
    const ledgerCtx = await loadLedgerContext(tx, { accountId: row.accountId, user });

    const target =
      patch.accountId && patch.accountId !== row.accountId
        ? await tx.accounts.require(patch.accountId, true)
        : source;
    const moving = target.id !== source.id;

    const renaming = patch.symbol !== undefined && patch.symbol !== row.symbol;
    if (renaming && row.assetClass !== 'STOCK') {
      throw new AppError('VALIDATION_FAILED', 422, 'Only a stock transaction can change its symbol');
    }
    if (patch.contract && row.assetClass !== 'OPTION') {
      throw new AppError('VALIDATION_FAILED', 422, 'Only an option transaction can change its contract');
    }
    const instrument: Pick<ResolvedInstrument, 'symbol' | 'contract'> & {
      currency: string;
      optionContractId: Uuid | null;
    } = renaming
      ? await resolveInstrument(tx, target.currency, {
          assetClass: 'STOCK',
          symbol: patch.symbol!,
        } as CreateTransactionInput)
      : patch.contract
        ? await resolveInstrument(tx, target.currency, {
            assetClass: 'OPTION',
            contract: patch.contract,
          } as CreateTransactionInput)
        : { symbol: row.symbol ?? '', currency: row.currency, optionContractId: row.optionContractId };
    const recontracted = instrument.optionContractId !== row.optionContractId;

    const type = (patch.type ?? row.type) as TxnRow['type'];
    if (type !== row.type && !EDITABLE_TYPE_FAMILIES.some((f) => f.includes(row.type) && f.includes(type))) {
      throw new AppError(
        'VALIDATION_FAILED',
        422,
        `A ${row.type} transaction cannot become ${type}. Delete it and add a new one instead.`,
        { fieldErrors: { type: 'This type cannot be changed to that one' } },
      );
    }

    if (moving && !renaming && row.assetClass === 'STOCK' && row.currency !== target.currency) {
      throw new AppError(
        'CURRENCY_MISMATCH',
        422,
        `${row.symbol ?? 'This stock'} trades in ${row.currency}, but ${target.name} is a ${target.currency} account. Move it to a ${row.currency} account.`,
        { symbol: row.symbol, currency: row.currency, accountCurrency: target.currency },
      );
    }

    const tradeDate = patch.tradeDate ?? row.tradeDate;

    const quantity = patch.quantity ?? row.quantity;
    const price = patch.price ?? row.price;
    const contract =
      instrument.contract ??
      (row.optionContractId ? ledgerCtx.contracts.get(row.optionContractId) : undefined);
    if (contract) ledgerCtx.contracts.set(contract.id, contract);
    assertNotAfterExpiration(type, tradeDate, contract);
    const requote = moving || type !== row.type || recontracted;
    const fee =
      patch.fee !== undefined
        ? { fee: patch.fee, feeSource: 'MANUAL' as FeeSource, commission: null, regulatory: null }
        : requote && row.feeSource === 'AUTO'
          ? await resolveFee(
              tx,
              target.feeScheduleId,
              { type, quantity: quantity ?? undefined, price: price ?? undefined },
              contract?.multiplier,
            ).then((f) => ({
              fee: f.fee,
              feeSource: f.feeSource,
              commission: f.breakdown?.commission ?? null,
              regulatory: f.breakdown ? regulatoryTotal(f.breakdown) : null,
            }))
          : {
              fee: row.fee,
              feeSource: row.feeSource,
              commission: row.feeCommission,
              regulatory: row.feeRegulatory,
            };

    const updated: TxnRow = {
      ...row,
      accountId: target.id,
      type,
      symbol: instrument.symbol || row.symbol,
      optionContractId: instrument.optionContractId,
      currency: instrument.currency,
      tradeDate,
      quantity,
      price,
      amount: patch.amount ?? row.amount,
      fee: fee.fee,
      feeSource: fee.feeSource,
      feeCommission: fee.commission,
      feeRegulatory: fee.regulatory,
      realizedBefore: !isOpeningTrade(type)
        ? null
        : patch.realizedBefore === undefined
          ? row.realizedBefore
          : patch.realizedBefore,
      splitFrom: patch.splitFrom ?? row.splitFrom,
      splitTo: patch.splitTo ?? row.splitTo,
      notes: patch.notes === undefined ? row.notes : patch.notes,
      isAutoExpired: 0,
      updatedAt: nowIso(),
    };

    const linked = row.linkedTxnId ? await tx.transactions.find(row.linkedTxnId) : undefined;
    const rows: TxnRow[] = [updated];
    if (linked && (row.type === 'ASN' || row.type === 'EXR')) {
      const generated = linkedStockTrade(rowToLedgerTxn(updated), contract!);
      rows.push({
        ...linked,
        accountId: target.id,
        symbol: generated.symbol ?? linked.symbol,
        type: generated.type,
        tradeDate,
        quantity: generated.quantity ?? null,
        price: generated.price ?? null,
        amount: generated.amount ?? null,
        updatedAt: nowIso(),
      });
    }

    const changedIds = new Set(rows.map((r) => r.id));
    const others = ledgerCtx.txns.filter((t) => !changedIds.has(t.id));
    const pending = rows.map((r) => rowToLedgerTxn(r));
    if (moving) {
      validate(
        others,
        ledgerCtx.opts,
        changedIds,
        patch.confirmNegativeStock === true,
        user.shortBuyHandling,
      );
      const targetCtx = await loadLedgerContext(tx, { accountId: target.id, user });
      if (contract) targetCtx.contracts.set(contract.id, contract);
      validate(
        [...targetCtx.txns, ...pending],
        targetCtx.opts,
        changedIds,
        patch.confirmNegativeStock === true,
        user.shortBuyHandling,
      );
    } else {
      validate(
        [...others, ...pending],
        ledgerCtx.opts,
        changedIds,
        patch.confirmNegativeStock === true,
        user.shortBuyHandling,
      );
    }

    for (const r of rows) {
      const { id: rowId, createdAt: _c, ...values } = r;
      await tx.transactions.update(rowId, values as Partial<NewTxnRow>);
    }
    await tx.snapshots.invalidateFrom(row.accountId, tradeDate < row.tradeDate ? tradeDate : row.tradeDate);
    if (moving) await tx.snapshots.invalidateFrom(target.id, tradeDate);

    const saved = await Promise.all(rows.map((r) => tx.transactions.find(r.id)));
    return saved.filter((r): r is TxnRow => r != null).map((r) => toTransactionDto(r, ledgerCtx.contracts));
  });
}

export async function regenerateLifecycleTrades(
  tx: StoreTx,
  contractId: Uuid,
  confirmNegativeStock = false,
): Promise<void> {
  const user = await tx.users.require();
  const events = await tx.transactions.lifecycleEvents(contractId);
  const accountIds = [...new Set(events.map((e) => e.accountId))];

  for (const accountId of accountIds) {
    const ledgerCtx = await loadLedgerContext(tx, { accountId, user });
    const contract = ledgerCtx.contracts.get(contractId)!;
    const rows: TxnRow[] = [];
    for (const { id } of events.filter((e) => e.accountId === accountId)) {
      const event = await tx.transactions.find(id);
      const linked = event?.linkedTxnId ? await tx.transactions.find(event.linkedTxnId) : undefined;
      if (!event || !linked) continue;
      const generated = linkedStockTrade(rowToLedgerTxn(event), contract);
      rows.push({
        ...linked,
        quantity: generated.quantity ?? null,
        price: generated.price ?? null,
        amount: generated.amount ?? null,
        updatedAt: nowIso(),
      });
    }
    if (rows.length === 0) continue;

    const regenerated = new Set(rows.map((r) => r.id));
    const ownIds = new Set(rows.flatMap((r) => (r.linkedTxnId ? [r.id, r.linkedTxnId] : [r.id])));
    validate(
      [...ledgerCtx.txns.filter((t) => !regenerated.has(t.id)), ...rows.map((r) => rowToLedgerTxn(r))],
      ledgerCtx.opts,
      ownIds,
      confirmNegativeStock,
    );
    for (const r of rows) {
      const { id: rowId, createdAt: _c, ...values } = r;
      await tx.transactions.update(rowId, values as Partial<NewTxnRow>);
    }
  }
}

export async function deleteTransaction(ctx: Ctx, id: Uuid, confirmed: boolean): Promise<void> {
  await ctx.store.transaction(ctx.principal, async (tx) => {
    const user = await tx.users.require();
    const row = await tx.transactions.find(id);
    if (!row) throw new AppError('NOT_FOUND', 404, 'No such transaction');
    if (row.isSystemGenerated === 1) {
      throw new AppError(
        'LINKED_TRANSACTION',
        409,
        'This stock trade was created by an assignment or exercise. Delete that option event instead.',
        { deleteInstead: row.linkedTxnId },
      );
    }
    await tx.accounts.require(row.accountId, true);

    const linked = row.linkedTxnId ? await tx.transactions.find(row.linkedTxnId) : undefined;
    const partner = linked ?? (await tx.transactions.findLinked(row.id));
    const ids = [row.id, ...(partner ? [partner.id] : [])];
    if (!confirmed) {
      throw new AppError(
        'CONFIRMATION_REQUIRED',
        409,
        partner
          ? 'Deleting this removes the linked transaction as well. Confirm to continue.'
          : 'Confirm to delete this transaction.',
        { ids },
      );
    }

    const ledgerCtx = await loadLedgerContext(tx, { accountId: row.accountId, user });
    const remaining = ledgerCtx.txns.filter((t) => !ids.includes(t.id));
    validate(remaining, ledgerCtx.opts, new Set());

    await tx.transactions.deleteMany(ids);
    await tx.snapshots.invalidateFrom(row.accountId, row.tradeDate);
  });
}

export async function listTransactions(ctx: Ctx, query: TransactionQuery) {
  const data = ctx.data;
  const { rows, total } = await data.transactions.query(query);
  const contractIds = [...new Set(rows.map((r) => r.optionContractId).filter((v): v is string => v != null))];
  const contracts = await data.contracts.effective(contractIds);
  return {
    items: rows.map((r) => toTransactionDto(r, contracts)),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function getTransaction(ctx: Ctx, id: Uuid): Promise<TransactionDto> {
  const data = ctx.data;
  const row = await data.transactions.find(id);
  if (!row) throw new AppError('NOT_FOUND', 404, 'No such transaction');
  const contracts = await data.contracts.effective(row.optionContractId ? [row.optionContractId] : []);
  return toTransactionDto(row, contracts);
}
