import type { Ctx } from '../context.js';
import { addDays, dec, positionSide, openQty, replay, type IsoDate } from '@tickrs/core';
import { describeOption } from '@tickrs/shared';
import type { Uuid } from '../model.js';
import { AppError } from '../errors.js';
import { ensureHistory } from './market-data.js';
import { loadLedgerContext } from './ledger-context.js';
import { type Range, rangeStart } from './performance.js';
import { loadRegistry } from './markets.js';
import { dayQuote, isStalePrice } from './valuation.js';

export interface ChartMarker {
  transactionId: Uuid;
  date: IsoDate;
  kind: 'BUY' | 'SELL' | 'OPTION';
  type: string;
  label: string;
  price: string | null;
  quantity: string | null;
  value: string | null;
  currency: string;
  isSystemGenerated: boolean;
  accountId: Uuid;
  accountName: string;
}

const STOCK_MARKER_KIND: Partial<Record<string, 'BUY' | 'SELL'>> = {
  BUY: 'BUY',
  BUY_TO_COVER: 'BUY',
  SELL: 'SELL',
  SELL_SHORT: 'SELL',
};

export interface StrikeLine {
  contractId: string;
  price: string;
  label: string;
  expiration: IsoDate;
  side: 'LONG' | 'SHORT';
}

export async function getStockChart(
  ctx: Ctx,
  symbol: string,
  options: { range?: Range; accountId?: Uuid } = {},
) {
  const data = ctx.data;
  const upper = symbol.toUpperCase();
  const security = await data.securities.find(upper);
  if (!security) throw new AppError('NOT_FOUND', 404, `No security "${upper}"`);

  const ledgerCtx = await loadLedgerContext(data, options.accountId ? { accountId: options.accountId } : {});
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

  const ledger = replay(ledgerCtx.txns, ledgerCtx.opts);
  const position = ledger.stocks.get(upper);
  const shares = position ? openQty(position.lots) : dec('0');
  const signedShares = position && positionSide(position.lots) === 'SHORT' ? shares.negated() : shares;
  const averagePrice = position && !shares.isZero() ? position.netInvested.div(signedShares) : null;

  const strikes: StrikeLine[] = [];
  for (const pos of ledger.options.values()) {
    const side = positionSide(pos.lots);
    const contract = ledgerCtx.contracts.get(pos.contractId);
    if (!side || !contract || contract.underlying !== upper || openQty(pos.lots).isZero()) continue;
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
    position: position
      ? {
          shares: signedShares.toFixed(),
          side: positionSide(position.lots),
          averagePrice: averagePrice?.toFixed() ?? null,
          realized: position.realized.toFixed(),
          dividends: position.dividends.toFixed(),
          shortCosts: position.shortCosts.toFixed(),
          dayChange:
            quote?.change != null && !shares.isZero() ? signedShares.times(quote.change).toFixed() : null,
        }
      : null,
    pendingHistory: history.pendingSymbols.length > 0,
  };
}
