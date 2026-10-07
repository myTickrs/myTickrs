import type { Ctx } from '../context.js';
import { dec, type Dec, type Ledger, type PortfolioValuation } from '@tickrs/core';
import { describeOption } from '@tickrs/shared';
import type { Uuid } from '../model.js';
import type { LedgerContext } from './ledger-context.js';
import { getExpirations, getNeedsAction } from './options.js';
import { valueAtClose } from './performance.js';
import { positionDayChanges, rateToBase, valuePortfolio } from './valuation.js';

export async function getPortfolioSummary(ctx: Ctx, accountId?: Uuid) {
  const data = ctx.data;
  const { ledgerCtx, ledger, valuation, previous } = await valuePortfolio(ctx, accountId, {
    previousClose: true,
  });
  const today = ctx.clock.today();
  const [needsAction, expiring, accounts, yearStart] = await Promise.all([
    getNeedsAction(ctx, accountId),
    getExpirations(ctx, 7, accountId),
    data.accounts.list(),
    valueAtClose(ctx, ledgerCtx, `${Number(today.slice(0, 4)) - 1}-12-31`),
  ]);

  const allTimeReturn = dec(valuation.totals.totalReturn);
  const totalReturn = {
    allTime: allTimeReturn.toFixed(),
    year: yearStart
      ? allTimeReturn.minus(dec(yearStart.marketValue).minus(yearStart.netContributions)).toFixed()
      : allTimeReturn.toFixed(),
  };

  const optionRealized = ledger.realized
    .filter((r) => r.kind === 'OPTION')
    .map((r) => ({ date: r.date, base: dec(r.amount).times(rateToBase(ledgerCtx, r.currency)) }));
  const realizedIn = (prefix: string) =>
    optionRealized.filter((r) => r.date.startsWith(prefix)).reduce((acc, r) => acc.plus(r.base), dec('0'));
  const openOption = dec(valuation.totals.unrealizedOption);
  const optionPnl = {
    allTime: realizedIn('').plus(openOption).toFixed(),
    year: realizedIn(today.slice(0, 4)).toFixed(),
    month: realizedIn(today.slice(0, 7)).toFixed(),
    open: openOption.toFixed(),
  };

  const previousValue = dec(previous!.positionsValue);
  const dayChange = dec(valuation.positionsValue).minus(previousValue);

  return {
    baseCurrency: valuation.baseCurrency,
    asOf: ctx.clock.today(),
    marketValue: valuation.marketValue,
    positionsValue: valuation.positionsValue,
    stocksValue: valuation.stocksValue,
    optionsValue: valuation.optionsValue,
    netContributions: valuation.netContributions,
    totals: valuation.totals,
    totalReturn,
    optionPnl,
    dayChange: {
      amount: dayChange.toFixed(),
      percent: previousValue.gt(0) ? dayChange.div(previousValue).toFixed() : null,
    },
    counts: {
      accounts: accounts.length,
      stocks: valuation.stocks.length,
      options: valuation.options.length,
      needsAction: needsAction.items.length,
      expiringSoon: expiring.items.length,
    },
    hasEstimatedValues: valuation.hasEstimatedValues,
  };
}

export async function getHoldings(ctx: Ctx, accountId?: Uuid) {
  const { ledgerCtx, ledger, valuation, previous } = await valuePortfolio(ctx, accountId, {
    previousClose: true,
  });
  const dayChange = positionDayChanges(valuation, previous!);
  const values = [
    ...valuation.stocks.map((s) => s.marketValueBase),
    ...valuation.options.map((o) => o.marketValueBase),
  ];
  const total = values.reduce((acc, v) => (dec(v).isPositive() ? acc.plus(v) : acc), dec('0'));
  const weight = (valueBase: string) => (total.isZero() ? '0' : dec(valueBase).div(total).toFixed());

  return {
    baseCurrency: valuation.baseCurrency,
    marketValue: valuation.marketValue,
    stocks: valuation.stocks.map((s) => ({
      ...s,
      weight: weight(s.marketValueBase),
      dayChange: dayChange.stock(s.symbol, s.marketValue),
      totalPl: totalPl(dec(s.unrealized).plus(s.realized).plus(s.dividends).plus(s.shortCosts), s.costBasis),
    })),
    options: valuation.options.map((o) => {
      const c = ledgerCtx.contracts.get(o.contractId);
      return {
        ...o,
        description: c ? (c.displayName ?? describeOption(c)) : o.underlying,
        expiration: c?.expiration ?? null,
        strike: c?.strike ?? null,
        right: c?.right ?? null,
        weight: weight(o.marketValueBase),
        dayChange: dayChange.option(o.contractId, o.marketValue),
        totalPl: totalPl(dec(o.unrealized).plus(o.realized), o.openAmount),
      };
    }),
    closedStocks: closedStocksOf(ledgerCtx, ledger, valuation),
    hasEstimatedValues: valuation.hasEstimatedValues,
  };
}

function totalPl(amount: Dec, cost: string | null) {
  return {
    amount: amount.toFixed(),
    percent: cost != null && dec(cost).gt(0) ? amount.div(cost).toFixed() : null,
  };
}

function closedStocksOf(ledgerCtx: LedgerContext, ledger: Ledger, valuation: PortfolioValuation) {
  const open = new Set(valuation.stocks.map((s) => s.symbol));
  return [...ledger.stocks.values()]
    .filter((pos) => !open.has(pos.symbol))
    .map((pos) => ({
      symbol: pos.symbol,
      currency: pos.currency,
      realized: pos.realized.toFixed(),
      dividends: pos.dividends.toFixed(),
      shortCosts: pos.shortCosts.toFixed(),
      totalPl: totalPl(pos.realized.plus(pos.dividends).plus(pos.shortCosts), null),
      fxRate: rateToBase(ledgerCtx, pos.currency).toFixed(),
    }))
    .toSorted((a, b) => a.symbol.localeCompare(b.symbol));
}

export async function getHoldingsByAccount(ctx: Ctx) {
  const accounts = await ctx.data.accounts.list();
  const valued = await Promise.all(
    accounts.map(async (account) => ({ account, ...(await valuePortfolio(ctx, account.id)) })),
  );
  const total = valued.reduce((acc, v) => acc.plus(v.valuation.marketValue), dec('0'));
  const gross = valued.reduce((acc, { valuation: v }) => {
    const values = [...v.stocks.map((s) => s.marketValueBase), ...v.options.map((o) => o.marketValueBase)];
    return values.reduce((sum, value) => (dec(value).isPositive() ? sum.plus(value) : sum), acc);
  }, dec('0'));
  const weight = (valueBase: string) => (gross.isZero() ? '0' : dec(valueBase).div(gross).toFixed());
  const baseCurrency =
    valued[0]?.valuation.baseCurrency ?? (await valuePortfolio(ctx)).valuation.baseCurrency;

  return {
    baseCurrency,
    marketValue: total.toFixed(),
    accounts: valued.map(({ account, ledger, valuation }) => ({
      accountId: account.id,
      accountName: account.name,
      currency: account.currency,
      marketValue: valuation.marketValue,
      positionsValue: [...valuation.stocks, ...valuation.options]
        .reduce((acc, p) => acc.plus(p.marketValue), dec('0'))
        .toFixed(),
      positionCount: valuation.stocks.length + valuation.options.length,
      closedCount: ledger.stocks.size - valuation.stocks.length,
      weight: weight(valuation.positionsValue),
      realized: [...ledger.stocks.values(), ...ledger.options.values()]
        .reduce((acc, p) => acc.plus(p.realized), dec('0'))
        .toFixed(),
      unrealized: [...valuation.stocks, ...valuation.options]
        .reduce((acc, p) => acc.plus(p.unrealized), dec('0'))
        .toFixed(),
    })),
    hasEstimatedValues: valued.some((v) => v.valuation.hasEstimatedValues),
  };
}
