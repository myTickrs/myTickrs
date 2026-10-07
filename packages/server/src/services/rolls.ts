import {
  cashEffect,
  dec,
  openQty,
  positionSide,
  replay,
  type EffectiveContract,
  type LedgerTxn,
} from '@tickrs/core';
import type { CreateTransactionInput, RollOptionInput } from '@tickrs/shared';
import type { Ctx } from '../context.js';
import { AppError } from '../errors.js';
import type { Uuid } from '../model.js';
import type { NewTxnRow, StoreTx, TxnRow } from '../store/ports.js';
import { loadLedgerContext, rowToLedgerTxn, toTransactionDto } from './ledger-context.js';
import {
  assertNotFuture,
  type BuildDeps,
  buildTransactionRows,
  insertRows,
  newBuildCache,
  validate,
} from './transactions.js';

const OPENING = new Set(['BTO', 'STO']);
const OPTION_TRADES = new Set(['BTO', 'STO', 'BTC', 'STC']);

async function findOpenPosition(tx: StoreTx, contractId: Uuid, accountId: Uuid | undefined) {
  const user = await tx.users.require();
  const everywhere = await loadLedgerContext(tx, { user });
  const candidates = accountId
    ? [accountId]
    : [...new Set(everywhere.rows.filter((r) => r.optionContractId === contractId).map((r) => r.accountId))];

  const open: { accountId: Uuid; side: 'LONG' | 'SHORT'; contracts: string }[] = [];
  for (const candidate of candidates) {
    const ledgerCtx = await loadLedgerContext(tx, { accountId: candidate, user });
    const position = replay(ledgerCtx.txns, ledgerCtx.opts).options.get(contractId);
    const side = position ? positionSide(position.lots) : null;
    if (position && side)
      open.push({ accountId: candidate, side, contracts: openQty(position.lots).toFixed() });
  }

  if (open.length === 0) {
    throw new AppError('NO_OPEN_POSITION', 422, 'There is no open position in this contract to roll', {
      optionContractId: contractId,
      ...(accountId ? { accountId } : {}),
    });
  }
  if (open.length > 1) {
    throw new AppError(
      'ACCOUNT_REQUIRED',
      422,
      'This contract is open in more than one account: choose one',
      {
        accounts: open.map(({ accountId: id, contracts }) => ({ accountId: id, contracts })),
      },
    );
  }
  return { ...open[0]!, user };
}

export async function rollOption(ctx: Ctx, input: RollOptionInput) {
  assertNotFuture(ctx.clock, input.tradeDate);

  return ctx.store.transaction(ctx.principal, async (tx) => {
    const current = await tx.contracts.find(input.optionContractId);
    if (!current) throw new AppError('NOT_FOUND', 404, 'No such option contract');
    const {
      accountId,
      side,
      contracts: openContracts,
      user,
    } = await findOpenPosition(tx, input.optionContractId, input.accountId);
    if (dec(input.quantity).gt(openContracts)) {
      throw new AppError(
        'ROLL_QUANTITY',
        422,
        `Only ${openContracts} contract(s) are open; you cannot roll ${input.quantity}`,
        { open: openContracts, quantity: input.quantity },
      );
    }

    const effective = (await tx.contracts.effective([current.id])).get(current.id)!;
    const right = effective.right;
    if (input.open.expiration === effective.expiration && dec(input.open.strike).eq(effective.strike)) {
      throw new AppError('SAME_CONTRACT', 422, 'Roll into a different expiration or strike', {
        expiration: input.open.expiration,
        strike: input.open.strike,
      });
    }

    const account = await tx.accounts.require(accountId, true);
    const ledgerCtx = await loadLedgerContext(tx, { accountId, user });
    const deps: BuildDeps = { tx, user, account, ledgerCtx, cache: newBuildCache() };
    const notes = input.notes ?? null;

    const closeInput = {
      accountId,
      assetClass: 'OPTION',
      type: side === 'SHORT' ? 'BTC' : 'STC',
      optionContractId: current.id,
      tradeDate: input.tradeDate,
      quantity: input.quantity,
      price: input.close.price,
      ...(input.close.fee !== undefined ? { fee: input.close.fee } : {}),
      ...(notes ? { notes } : {}),
    } as CreateTransactionInput;
    const openInput = {
      accountId,
      assetClass: 'OPTION',
      type: side === 'SHORT' ? 'STO' : 'BTO',
      contract: {
        underlying: effective.underlying,
        expiration: input.open.expiration,
        strike: input.open.strike,
        right,
        multiplier: current.multiplier,
        style: current.style,
        settlement: current.settlement,
      },
      tradeDate: input.tradeDate,
      quantity: input.open.quantity ?? input.quantity,
      price: input.open.price,
      ...(input.open.fee !== undefined ? { fee: input.open.fee } : {}),
      ...(notes ? { notes } : {}),
    } as CreateTransactionInput;

    const [close] = await buildTransactionRows(deps, closeInput);
    const [open] = await buildTransactionRows(deps, openInput);
    const rows = [close!, open!];

    const ownIds = new Set(rows.map((r) => r.id as string));
    const pending = rows.map((r) => rowToLedgerTxn(r as TxnRow));
    validate([...ledgerCtx.txns, ...pending], ledgerCtx.opts, ownIds);

    const netPremium = pending
      .reduce((sum, txn) => sum.plus(cashEffect(txn, ledgerCtx.contracts)), dec('0'))
      .toFixed();
    if (input.dryRun) {
      return { dryRun: true as const, accountId, netPremium, fees: rows.map((r) => String(r.fee)) };
    }

    const positionRows = ledgerCtx.rows.filter((r) => r.optionContractId === current.id);
    const existing = await chainOf(tx, positionRows);
    const group =
      existing ??
      (await tx.strategyGroups.create({
        kind: 'ROLL_CHAIN',
        name: `${effective.underlying} roll chain`,
      }));
    const grouped: NewTxnRow[] = rows.map((r) => ({ ...r, strategyGroupId: group.id }));

    await insertRows(tx, grouped);
    if (!existing) {
      for (const row of positionRows.filter((r) => OPENING.has(r.type) && r.strategyGroupId == null)) {
        await tx.transactions.update(row.id, { strategyGroupId: group.id });
      }
    }
    await tx.snapshots.invalidateFrom(accountId, input.tradeDate);

    const saved = (await Promise.all(grouped.map((r) => tx.transactions.find(r.id as string)))).filter(
      (r): r is TxnRow => r != null,
    );
    return {
      dryRun: false as const,
      strategyGroupId: group.id,
      accountId,
      netPremium,
      transactions: saved.map((r) => toTransactionDto(r, ledgerCtx.contracts)),
    };
  });
}

async function chainOf(tx: StoreTx, rows: readonly TxnRow[]) {
  const ids = [...new Set(rows.map((r) => r.strategyGroupId).filter((id): id is Uuid => id != null))];
  for (const id of ids.toReversed()) {
    const group = await tx.strategyGroups.find(id);
    if (group?.kind === 'ROLL_CHAIN') return group;
  }
  return undefined;
}

export interface RollChainSummary {
  strategyGroupId: Uuid;
  rolls: number;
  netPremium: string;
}

export function rollChainsByContract(
  rows: readonly TxnRow[],
  txns: readonly LedgerTxn[],
  contracts: ReadonlyMap<string, EffectiveContract>,
): Map<string, RollChainSummary> {
  const chainRows = new Map<string, number[]>();
  rows.forEach((row, index) => {
    if (row.strategyGroupId && OPTION_TRADES.has(row.type)) {
      chainRows.set(row.strategyGroupId, [...(chainRows.get(row.strategyGroupId) ?? []), index]);
    }
  });

  const summaries = new Map<string, RollChainSummary>();
  for (const [groupId, indexes] of chainRows) {
    const closes = indexes.filter((i) => rows[i]!.type === 'BTC' || rows[i]!.type === 'STC').length;
    if (closes === 0) continue;
    const net = indexes.reduce((sum, i) => sum.plus(cashEffect(txns[i]!, contracts)), dec('0'));
    const summary = { strategyGroupId: groupId, rolls: closes, netPremium: net.toFixed() };
    for (const i of indexes) {
      const row = rows[i]!;
      if (OPENING.has(row.type) && row.optionContractId) summaries.set(row.optionContractId, summary);
    }
  }
  return summaries;
}
