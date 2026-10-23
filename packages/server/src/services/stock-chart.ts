import type { Ctx } from '../context.js';
import { addDays, type Dec, dec, positionSide, openQty } from '@tickrs/core';
import {
  type ChartMarker,
  describeOption,
  type StockChartResponse,
  type StockPnlSplit,
  type StrikeLine,
} from '@tickrs/shared';
import type { Uuid } from '../model.js';
import { AppError } from '../errors.js';
import { ensureHistory } from './market-data.js';
import { type Range, rangeStart } from './performance.js';
import { loadRegistry } from './markets.js';
import { dayQuote, isStalePrice, positionDayChanges, valuePortfolio } from './valuation.js';

const STOCK_MARKER_KIND: Partial<Record<string, 'BUY' | 'SELL'>> = {
  BUY: 'BUY',
  BUY_TO_COVER: 'BUY',
  SELL: 'SELL',
  SELL_SHORT: 'SELL',
};

const sum = (amounts: (string | Dec)[]) => amounts.reduce<Dec>((acc, a) => acc.plus(a), dec('0'));

const split = (stock: Dec, option: Dec): StockPnlSplit => ({
  total: stock.plus(option).toFixed(),
  stock: stock.toFixed(),
  option: option.toFixed(),
});

export async function getStockChart(
  ctx: Ctx,
  symbol: string,
  options: { range?: Range; accountId?: Uuid } = {},
): Promise<StockChartResponse> {
  const data = ctx.data;
  const upper = symbol.toUpperCase();
  const security = await data.securities.find(upper);
  if (!security) throw new AppError('NOT_FOUND', 404, `No security "${upper}"`);

  const { ledgerCtx, ledger, valuation, previous } = await valuePortfolio(ctx, options.accountId, {
    previousClose: true,
  });
  const mine = ledgerCtx.rows.filter((r) => r.symbol === upper);
  const today = ctx.clock.today();
  const first = mine[0]?.tradeDate ?? today;
  const from = rangeStart(options.range ?? '1Y', first, today);

  const history = await ensureHistory(ctx, [upper], from < first ? from : first, today);
  const bars = await data.prices.symbolBars(upper, from);
  const accountNames = new Map((await data.accounts.list()).map((a) => [a.id, a.name]));
  const [latest, recentCloses, registry] = await Promise.all([
    data.prices.latest(),
    data.prices.symbolCloses(upper, addDays(today, -31)),
    loadRegistry(data),
  ]);
  const clock = registry.clockOf(upper);
  const day = dayQuote(
    latest.find((q) => q.symbol === upper),
    recentCloses,
    clock.date(new Date(ctx.clock.nowIso())),
    clock,
  );
  const quote =
    day && !day.estimated && isStalePrice(registry, upper, day.date, new Date(ctx.clock.nowIso()))
      ? { ...day, estimated: true }
      : day;

  const markers: ChartMarker[] = mine
    .filter((r) => r.tradeDate >= from)
    .map((r) => {
      const contract = r.optionContractId ? ledgerCtx.contracts.get(r.optionContractId) : undefined;
      const isStock = r.assetClass === 'STOCK';
      return {
        transactionId: r.id,
        date: r.tradeDate,
        kind: isStock ? (STOCK_MARKER_KIND[r.type] ?? 'OPTION') : 'OPTION',
        type: r.type,
        label: contract
          ? `${r.type} ${dec(contract.strike).toFixed()}${contract.right === 'CALL' ? 'C' : 'P'}`
          : `${r.type} ${r.quantity ?? ''}`.trim(),
        price: contract ? contract.strike : r.price,
        quantity: r.quantity,
        value:
          r.quantity != null && r.price != null
            ? dec(r.quantity)
                .times(r.price)
                .times(contract ? contract.multiplier : '1')
                .toFixed()
            : null,
        currency: r.currency,
        isSystemGenerated: r.isSystemGenerated === 1,
        accountId: r.accountId,
        accountName: accountNames.get(r.accountId) ?? '',
      };
    });

  const position = ledger.stocks.get(upper);
  const shares = position ? openQty(position.lots) : dec('0');
  const signedShares = position && positionSide(position.lots) === 'SHORT' ? shares.negated() : shares;
  const averagePrice = position && !shares.isZero() ? position.netInvested.div(signedShares) : null;

  const optionPositions = [...ledger.options.values()].filter((p) => p.underlying === upper);
  const realized = split(
    position ? position.realized.plus(position.dividends) : dec('0'),
    sum(optionPositions.map((p) => p.realized)),
  );
  const unrealized = split(
    sum(valuation.stocks.filter((s) => s.symbol === upper).map((s) => s.unrealized)),
    sum(valuation.options.filter((o) => o.underlying === upper).map((o) => o.unrealized)),
  );

  const stockDayChange = quote?.change != null && !shares.isZero() ? signedShares.times(quote.change) : null;
  const openOptions = valuation.options.filter((o) => o.underlying === upper);
  const optionMoves = positionDayChanges(valuation, previous!);
  const optionDayChange =
    openOptions.length > 0
      ? sum(openOptions.map((o) => optionMoves.option(o.contractId, o.marketValue).amount))
      : null;
  const dayChange =
    stockDayChange || optionDayChange
      ? {
          total: (stockDayChange ?? dec('0')).plus(optionDayChange ?? dec('0')).toFixed(),
          stock: stockDayChange?.toFixed() ?? null,
          option: optionDayChange?.toFixed() ?? null,
        }
      : null;

  const strikes: StrikeLine[] = [];
  for (const pos of optionPositions) {
    const side = positionSide(pos.lots);
    const contract = ledgerCtx.contracts.get(pos.contractId);
    if (!side || !contract || openQty(pos.lots).isZero()) continue;
    strikes.push({
      contractId: pos.contractId,
      price: contract.strike,
      expiration: contract.expiration,
      side,
      label: describeOption({
        underlying: contract.underlying,
        expiration: contract.expiration,
        strike: contract.strike,
        right: contract.right,
      }),
    });
  }

  return {
    symbol: upper,
    name: security.name,
    currency: security.currency,
    range: options.range ?? '1Y',
    from,
    to: today,
    bars,
    markers,
    strikes,
    quote,
    position:
      position || optionPositions.length > 0
        ? {
            shares: signedShares.toFixed(),
            side: position ? positionSide(position.lots) : null,
            averagePrice: averagePrice?.toFixed() ?? null,
            realized,
            unrealized,
            shortCosts: position?.shortCosts.toFixed() ?? '0',
            dayChange,
          }
        : null,
    pendingHistory: history.pendingSymbols.length > 0,
  };
}
