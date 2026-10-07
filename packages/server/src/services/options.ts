import type { Ctx } from '../context.js';
import {
  breakEven,
  callCoverage,
  type CoverageStatus,
  dec,
  daysToExpiration,
  type EffectiveContract,
  expiredOpenPositions,
  moneyness,
  openQty,
  replay,
  returnOnRisk,
  suggestExpirationOutcome,
} from '@tickrs/core';
import { defaultOptionTerms, describeOption, formatContractKey, parseOptionSymbol } from '@tickrs/shared';
import { resolveUnderlying } from './option-contracts.js';
import type { IsoDate, Uuid } from '../model.js';
import { AppError } from '../errors.js';
import { loadLedgerContext, toTransactionDto } from './ledger-context.js';
import {
  createTransaction,
  regenerateLifecycleTrades,
  settlementPriceRequired,
  validate,
} from './transactions.js';
import { loadRegistry } from './markets.js';
import { rollChainsByContract } from './rolls.js';
import { positionDayChanges, rateToBase, valuePortfolio } from './valuation.js';

const describe = (c: EffectiveContract) =>
  c.displayName ??
  describeOption({ underlying: c.underlying, expiration: c.expiration, strike: c.strike, right: c.right });

export async function deleteOptionPosition(
  ctx: Ctx,
  contractId: Uuid,
  options: { accountId?: Uuid; confirmed: boolean },
): Promise<void> {
  await ctx.store.transaction(ctx.principal, async (tx) => {
    const user = await tx.users.require();
    const rows = (await tx.transactions.listForUser()).filter(
      (r) => r.optionContractId === contractId && (!options.accountId || r.accountId === options.accountId),
    );
    if (rows.length === 0) throw new AppError('NOT_FOUND', 404, 'No transactions in this option contract');
    const ids = new Set(rows.flatMap((r) => (r.linkedTxnId ? [r.id, r.linkedTxnId] : [r.id])));
    if (!options.confirmed) {
      throw new AppError(
        'CONFIRMATION_REQUIRED',
        409,
        rows.length === 1
          ? 'Deleting this position removes its transaction. Confirm to continue.'
          : `Deleting this position removes its ${rows.length} transactions. Confirm to continue.`,
        { ids: [...ids], count: rows.length },
      );
    }

    const earliest = new Map<Uuid, IsoDate>();
    for (const r of rows) {
      const date = earliest.get(r.accountId);
      if (!date || r.tradeDate < date) earliest.set(r.accountId, r.tradeDate);
    }
    for (const accountId of earliest.keys()) {
      await tx.accounts.require(accountId, true);
      const ledgerCtx = await loadLedgerContext(tx, { accountId, user });
      validate(
        ledgerCtx.txns.filter((t) => !ids.has(t.id)),
        ledgerCtx.opts,
        new Set(),
      );
    }

    await tx.transactions.deleteMany([...ids]);
    for (const [accountId, date] of earliest) await tx.snapshots.invalidateFrom(accountId, date);
  });
}

export type OptionOutcome = 'CLOSED' | 'ROLLED' | 'EXPIRED' | 'ASSIGNED' | 'EXERCISED';

const OUTCOME_BY_TYPE: Record<string, OptionOutcome> = {
  BTC: 'CLOSED',
  STC: 'CLOSED',
  EXP: 'EXPIRED',
  ASN: 'ASSIGNED',
  EXR: 'EXERCISED',
};

export async function getClosedOptionPositions(ctx: Ctx, accountId?: Uuid) {
  const { ledgerCtx, ledger, valuation } = await valuePortfolio(ctx, accountId);
  const rowsById = new Map(ledgerCtx.rows.map((r) => [r.id, r]));
  const accountNames = new Map((await ctx.data.accounts.list()).map((a) => [a.id, a.name]));
  const rolled = (row: (typeof ledgerCtx.rows)[number] | undefined) =>
    !!row?.strategyGroupId &&
    ledgerCtx.rows.some(
      (r) =>
        r.strategyGroupId === row.strategyGroupId &&
        (r.type === 'BTO' || r.type === 'STO') &&
        r.tradeDate === row.tradeDate,
    );

  const positionOf = (txnId: string) => ledger.optionPositionOf.get(txnId) ?? txnId;
  const byPosition = new Map<
    string,
    {
      events: (typeof ledger.realized)[number][];
      amount: ReturnType<typeof dec>;
      contracts: ReturnType<typeof dec>;
    }
  >();
  for (const event of ledger.realized) {
    if (event.kind !== 'OPTION' || !event.contractId || event.carriedIn) continue;
    const key = `${rowsById.get(event.txnId)?.accountId ?? ''}|${positionOf(event.txnId)}`;
    const seen = byPosition.get(key) ?? { events: [], amount: dec('0'), contracts: dec('0') };
    const repeat = seen.events.some((e) => e.txnId === event.txnId);
    byPosition.set(key, {
      events: [...seen.events, event],
      amount: seen.amount.plus(event.amount),
      contracts: repeat ? seen.contracts : seen.contracts.plus(event.contracts ?? '0'),
    });
  }

  const tradesOf = (position: string, inAccount: string | undefined) => {
    const option = ledgerCtx.rows.filter(
      (r) => r.optionContractId && r.accountId === inAccount && positionOf(r.id) === position,
    );
    const linked = new Set(option.flatMap((r) => (r.linkedTxnId ? [r.linkedTxnId] : [])));
    return ledgerCtx.rows
      .filter((r) => option.includes(r) || linked.has(r.id))
      .map((r) => toTransactionDto(r, ledgerCtx.contracts));
  };

  const items = [...byPosition.values()].map(({ events, amount, contracts }) => {
    const event = events.at(-1)!;
    const c = contractOf(ledgerCtx, event.contractId!);
    const row = rowsById.get(event.txnId);
    const outcome = OUTCOME_BY_TYPE[event.closeType] ?? 'CLOSED';
    return {
      txnId: event.txnId,
      date: event.date,
      closeType: event.closeType,
      outcome: outcome === 'CLOSED' && rolled(row) ? ('ROLLED' as const) : outcome,
      contractId: event.contractId!,
      contract: describe(c),
      underlying: c.underlying,
      expiration: c.expiration,
      strike: c.strike,
      right: c.right,
      side: event.side,
      contracts: event.contracts === null ? null : contracts.toFixed(),
      account: row ? { id: row.accountId, name: accountNames.get(row.accountId) ?? '' } : null,
      currency: event.currency,
      amount: amount.toFixed(),
      rolledIntoStock: events.every((e) => e.rolledIntoStock),
      transactions: tradesOf(positionOf(event.txnId), row?.accountId),
    };
  });
  return {
    baseCurrency: valuation.baseCurrency,
    items: items.toSorted((x, y) => (x.date === y.date ? 0 : x.date < y.date ? 1 : -1)),
  };
}

export async function getOptionPositions(ctx: Ctx, options: { accountId?: Uuid } = {}) {
  const today = ctx.clock.today();
  const { ledgerCtx, valuation, previous, priceOf } = await valuePortfolio(ctx, options.accountId, {
    previousClose: true,
  });
  const dayChange = positionDayChanges(valuation, previous!);

  const sharesBysymbol = new Map(
    valuation.stocks.filter((s) => s.side === 'LONG').map((s) => [s.symbol, s.quantity]),
  );
  const shortCalls = valuation.options.filter(
    (o) => o.side === 'SHORT' && contractOf(ledgerCtx, o.contractId).right === 'CALL',
  );
  const coverageByContract = new Map<string, CoverageStatus>();
  for (const underlying of new Set(shortCalls.map((o) => o.underlying))) {
    const calls = shortCalls
      .filter((o) => o.underlying === underlying)
      .map((o) => {
        const c = contractOf(ledgerCtx, o.contractId);
        return {
          contractId: o.contractId,
          expiration: c.expiration,
          contracts: o.contracts,
          deliverableShares: c.deliverableShares,
        };
      });
    for (const status of callCoverage(sharesBysymbol.get(underlying) ?? '0', calls)) {
      coverageByContract.set(status.contractId, status);
    }
  }

  const chains = rollChainsByContract(ledgerCtx.rows, ledgerCtx.txns, ledgerCtx.contracts);
  const accountNames = new Map((await ctx.data.accounts.list()).map((a) => [a.id, a.name]));
  const accountsByContract = new Map<string, { id: Uuid; name: string }[]>();
  for (const row of ledgerCtx.rows) {
    if (!row.optionContractId) continue;
    const list = accountsByContract.get(row.optionContractId) ?? [];
    if (!list.some((a) => a.id === row.accountId)) {
      list.push({ id: row.accountId, name: accountNames.get(row.accountId) ?? '' });
    }
    accountsByContract.set(row.optionContractId, list);
  }

  const items = valuation.options.map((o) => {
    const c = contractOf(ledgerCtx, o.contractId);
    const underlyingPrice = priceOf(o.underlying);
    const dte = daysToExpiration(c.expiration, today);
    const perShare = dec(o.averagePremium);
    const ror =
      o.side === 'SHORT' && c.right === 'PUT'
        ? returnOnRisk(o.openAmount, c.strike, c.deliverableShares, o.contracts, dte)
        : null;
    return {
      ...o,
      description: describe(c),
      accounts: accountsByContract.get(o.contractId) ?? [],
      dayChange: dayChange.option(o.contractId, o.marketValue),
      expiration: c.expiration,
      strike: c.strike,
      right: c.right,
      multiplier: c.multiplier,
      style: c.style ?? 'AMERICAN',
      settlement: c.settlement ?? 'PHYSICAL',
      isAdjusted: c.isAdjusted,
      daysToExpiration: dte,
      needsAction: c.expiration < today,
      moneyness: underlyingPrice ? moneyness(c.right, c.strike, underlyingPrice) : null,
      underlyingPrice,
      breakEven: breakEven(c.right, c.strike, perShare).toFixed(),
      coverage: coverageByContract.get(o.contractId)?.status ?? null,
      returnOnRisk: ror ? ror.returnOnRisk.toFixed() : null,
      annualizedReturnOnRisk: ror?.annualized ? ror.annualized.toFixed() : null,
      rollChain: chains.get(o.contractId) ?? null,
    };
  });

  return { baseCurrency: valuation.baseCurrency, asOf: today, items };
}

function contractOf(
  ledgerCtx: { contracts: ReadonlyMap<string, EffectiveContract> },
  id: string,
): EffectiveContract {
  const c = ledgerCtx.contracts.get(id);
  if (!c) throw new AppError('NOT_FOUND', 404, 'Unknown option contract');
  return c;
}

export async function getExpirations(ctx: Ctx, withinDays: number, accountId?: Uuid) {
  const { items, asOf } = await getOptionPositions(ctx, { accountId });
  const soon = items
    .filter((i) => i.daysToExpiration <= withinDays)
    .toSorted((a, b) => a.daysToExpiration - b.daysToExpiration);
  return { asOf, withinDays, items: soon };
}

export async function getNeedsAction(ctx: Ctx, accountId?: Uuid) {
  const data = ctx.data;
  const today = ctx.clock.today();
  const user = await data.users.require();
  let { ledgerCtx, ledger, priceOf, closeOn } = await valuePortfolio(ctx, accountId);

  const expired = expiredOpenPositions(ledger, today);
  const closeFor = (c: EffectiveContract) => closeOn(c.underlying, c.expiration) ?? priceOf(c.underlying);
  const suggestionFor = (contractId: string, side: 'LONG' | 'SHORT') => {
    const c = contractOf(ledgerCtx, contractId);
    const close = closeFor(c);
    return close ? suggestExpirationOutcome(c, side, close) : null;
  };

  if (user.autoExpireOtm === 1) {
    const autoExpire = expired.filter((p) => suggestionFor(p.contractId, p.side)?.outcome === 'EXP');
    if (autoExpire.length > 0) {
      for (const p of autoExpire) {
        const accountsWith = ledgerCtx.rows.filter((r) => r.optionContractId === p.contractId);
        const targetAccount = accountId ?? accountsWith[0]?.accountId;
        if (!targetAccount) continue;
        await createTransaction(
          ctx,
          {
            accountId: targetAccount,
            assetClass: 'OPTION',
            type: 'EXP',
            optionContractId: p.contractId,
            tradeDate: p.expiration,
            notes: 'Expired worthless (applied automatically)',
          },
          { autoExpired: true },
        );
      }
      ({ ledgerCtx, ledger, priceOf, closeOn } = await valuePortfolio(ctx, accountId));
    }
  }

  const items = expiredOpenPositions(ledger, today).map((p) => {
    const c = contractOf(ledgerCtx, p.contractId);
    const suggestion = suggestionFor(p.contractId, p.side);
    return {
      contractId: p.contractId,
      description: describe(c),
      underlying: p.underlying,
      expiration: p.expiration,
      side: p.side,
      contracts: p.contracts,
      accountId: ledgerCtx.rows.find((r) => r.optionContractId === p.contractId)?.accountId ?? null,
      underlyingClose: closeFor(c),
      settlement: c.settlement ?? 'PHYSICAL',
      suggestedOutcome: suggestion?.outcome ?? null,
      moneyness: suggestion?.moneyness ?? null,
    };
  });
  return { asOf: today, items };
}

export interface ResolveNeedsActionItem {
  contractId: Uuid;
  accountId: Uuid;
  outcome: 'EXP' | 'ASN' | 'EXR';
  quantity?: string;
  fee?: string;
  price?: string;
  confirmNegativeStock?: boolean;
}

async function openContracts(ctx: Ctx, accountId: Uuid, contractId: Uuid): Promise<string | undefined> {
  const ledgerCtx = await loadLedgerContext(ctx.data, { accountId });
  const position = replay(ledgerCtx.txns, ledgerCtx.opts).options.get(contractId);
  const open = position ? openQty(position.lots) : null;
  return open && !open.isZero() ? open.toFixed() : undefined;
}

export async function resolveNeedsAction(ctx: Ctx, items: readonly ResolveNeedsActionItem[]) {
  const data = ctx.data;
  const created = [];
  let closeOn: ((symbol: string, date: IsoDate) => string | null) | undefined;
  for (const item of items) {
    const contract = await data.contracts.find(item.contractId);
    if (!contract) throw new AppError('NOT_FOUND', 404, 'No such option contract');
    let price = item.price;
    if (item.outcome !== 'EXP' && contract.settlement === 'CASH' && price == null) {
      closeOn ??= (await valuePortfolio(ctx)).closeOn;
      price = closeOn(contract.underlyingSymbol, contract.expiration) ?? undefined;
      if (price == null) throw settlementPriceRequired(contract.underlyingSymbol);
    }
    const quantity =
      item.quantity ??
      (item.outcome === 'EXP' ? undefined : await openContracts(ctx, item.accountId, item.contractId));
    const result = await createTransaction(ctx, {
      accountId: item.accountId,
      assetClass: 'OPTION',
      type: item.outcome,
      optionContractId: item.contractId,
      tradeDate: contract.expiration,
      ...(quantity ? { quantity } : {}),
      ...(item.fee ? { fee: item.fee } : {}),
      ...(item.outcome !== 'EXP' && price != null ? { price } : {}),
      ...(item.confirmNegativeStock ? { confirmNegativeStock: true } : {}),
    } as Parameters<typeof createTransaction>[1]);
    created.push(...result);
  }
  return { items: created };
}

export async function getOptionIncome(ctx: Ctx, accountId?: Uuid) {
  const { ledgerCtx, ledger, valuation } = await valuePortfolio(ctx, accountId);
  const byMonth = new Map<string, { realized: ReturnType<typeof dec>; count: number; wins: number }>();
  const byUnderlying = new Map<string, { realized: ReturnType<typeof dec>; currency: string }>();

  for (const event of ledger.realized) {
    if (event.kind !== 'OPTION') continue;
    const month = event.date.slice(0, 7);
    const amount = dec(event.amount);
    const entry = byMonth.get(month) ?? { realized: dec('0'), count: 0, wins: 0 };
    byMonth.set(month, {
      realized: entry.realized.plus(amount.times(rateToBase(ledgerCtx, event.currency))),
      count: entry.count + (event.rolledIntoStock || event.carriedIn ? 0 : 1),
      wins: entry.wins + (!event.rolledIntoStock && !event.carriedIn && amount.gt(0) ? 1 : 0),
    });
    const underlying = byUnderlying.get(event.symbol);
    byUnderlying.set(event.symbol, {
      realized: (underlying?.realized ?? dec('0')).plus(amount),
      currency: event.currency,
    });
  }

  const months = [...byMonth.entries()].toSorted().map(([month, v]) => ({
    month,
    realized: v.realized.toFixed(),
    closed: v.count,
    winRate: v.count > 0 ? dec(String(v.wins)).div(v.count).toFixed() : null,
  }));
  return {
    baseCurrency: valuation.baseCurrency,
    months,
    byUnderlying: Object.fromEntries(
      [...byUnderlying].map(([k, v]) => [k, { realized: v.realized.toFixed(), currency: v.currency }]),
    ),
    openPremium: valuation.options
      .filter((o) => o.side === 'SHORT')
      .reduce((acc, o) => acc.plus(dec(o.openAmount).times(o.fxRate)), dec('0'))
      .toFixed(),
    contracts: ledgerCtx.contracts.size,
  };
}

export async function setManualMark(ctx: Ctx, contractId: Uuid, mark: string, asOf?: IsoDate) {
  const data = ctx.data;
  const contract = await data.contracts.find(contractId);
  if (!contract) throw new AppError('NOT_FOUND', 404, 'No such option contract');
  const day =
    asOf ?? (await loadRegistry(data)).clockOf(contract.underlyingSymbol).date(new Date(ctx.clock.nowIso()));
  await data.optionQuotes.setManualMark({ optionContractId: contractId, mark, asOf: day });
  return { contractId, mark, asOf: day };
}

export async function clearManualMark(ctx: Ctx, contractId: Uuid) {
  const data = ctx.data;
  await data.optionQuotes.clearManualMark(contractId);
}

export interface ContractTermsInput {
  multiplier?: string | null;
  deliverableShares?: string | null;
  cashInLieu?: string | null;
  strike?: string | null;
  quoteSymbol?: string | null;
  displayName?: string | null;
  note?: string | null;
}

export async function getContractTerms(ctx: Ctx, contractId: Uuid) {
  const data = ctx.data;
  const contract = await data.contracts.find(contractId);
  if (!contract) throw new AppError('NOT_FOUND', 404, 'No such option contract');
  const [adjustment] = await data.contracts.listAdjustments([contractId]);
  const ledgerCtx = await loadLedgerContext(data);
  const effective = ledgerCtx.contracts.get(contractId);
  return {
    contractId,
    contractKey: contract.contractKey,
    original: {
      underlying: contract.underlyingSymbol,
      expiration: contract.expiration,
      strike: contract.strike,
      right: contract.optionRight,
      multiplier: contract.multiplier,
      deliverableShares: contract.multiplier,
      cashInLieu: '0',
      style: contract.style,
      settlement: contract.settlement,
    },
    adjustment: adjustment ?? null,
    effective: effective ?? null,
  };
}

export async function saveContractTerms(
  ctx: Ctx,
  contractId: Uuid,
  input: ContractTermsInput | null,
  confirmNegativeStock = false,
) {
  await ctx.store.transaction(ctx.principal, async (tx) => {
    const contract = await tx.contracts.find(contractId);
    if (!contract) throw new AppError('NOT_FOUND', 404, 'No such option contract');

    if (input === null) {
      await tx.contracts.deleteAdjustment(contractId);
    } else {
      await tx.contracts.upsertAdjustment(contractId, input);
    }
    await regenerateLifecycleTrades(tx, contractId, confirmNegativeStock);
    for (const accountId of await tx.accounts.ids()) {
      await tx.snapshots.invalidateAccount(accountId);
    }
  });
  return getContractTerms(ctx, contractId);
}

export type KnownTermsSource = 'CONTRACT' | 'UNDERLYING' | 'MARKET';

export async function lookupContractTerms(
  ctx: Ctx,
  input: {
    underlying: string;
    expiration?: string;
    strike?: string;
    right?: 'CALL' | 'PUT';
    currency?: string;
  },
) {
  const registry = await loadRegistry(ctx.data);
  const currency = input.currency ?? registry.home?.currency ?? 'USD';
  const underlying = resolveUnderlying(registry, input.underlying, currency);
  const none = { underlying, multiplier: null, style: null, settlement: null, source: null };
  if (!underlying) return none;

  const ledgerCtx = await loadLedgerContext(ctx.data);
  const mine = [...ledgerCtx.contracts.values()].filter((c) => c.underlying === underlying);
  if (input.expiration && input.strike && input.right) {
    const key = formatContractKey({
      underlying,
      expiration: input.expiration,
      strike: input.strike,
      right: input.right,
    });
    const own = mine.find((c) => formatContractKey(c.original) === key);
    const shared = own ? undefined : await ctx.data.contracts.findByKey(key);
    if (own || shared) {
      return {
        underlying,
        multiplier: own?.multiplier ?? shared!.multiplier,
        style: own?.style ?? shared!.style,
        settlement: own?.settlement ?? shared!.settlement,
        source: 'CONTRACT' as KnownTermsSource,
      };
    }
  }
  const latest = mine.toSorted((a, b) => (a.expiration < b.expiration ? 1 : -1))[0];
  if (latest) {
    return {
      underlying,
      multiplier: latest.multiplier,
      style: latest.style ?? 'AMERICAN',
      settlement: latest.settlement ?? 'PHYSICAL',
      source: 'UNDERLYING' as KnownTermsSource,
    };
  }
  const defaults = defaultOptionTerms(underlying, registry.marketOf(underlying)?.country);
  return defaults ? { underlying, ...defaults, source: 'MARKET' as KnownTermsSource } : none;
}

export async function parseContractSymbol(ctx: Ctx, symbol: string, accountCurrency?: string) {
  const written = parseOptionSymbol(symbol);
  if (!written)
    throw new AppError('VALIDATION_FAILED', 422, `Could not read "${symbol}" as an option symbol`);
  const registry = await loadRegistry(ctx.data);
  const currency = accountCurrency ?? registry.home?.currency ?? 'USD';
  const parts = { ...written, underlying: resolveUnderlying(registry, written.underlying, currency) };
  const market = registry.marketOf(parts.underlying);
  const existing = await ctx.data.contracts.findByKey(formatContractKey(parts));
  const defaults = defaultOptionTerms(parts.underlying, market?.country);
  return {
    ...parts,
    description: describeOption(parts),
    currency: registry.currencyOf(parts.underlying),
    market: market?.code ?? null,
    supported: defaults != null,
    terms: existing
      ? { multiplier: existing.multiplier, style: existing.style, settlement: existing.settlement }
      : (defaults ?? null),
  };
}
