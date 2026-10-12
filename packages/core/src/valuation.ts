import { Dec, dec } from './decimal.js';
import { type Ledger, positionSide } from './ledger.js';
import { openQty, totalAmount } from './lots.js';
import type { PositionSide } from './types.js';

export interface StockPrice {
  price: string;
  estimated?: boolean;
  asOf?: string | null;
}

export interface OptionMark {
  mark: string;
  estimated?: boolean;
  source?: string;
  asOf?: string | null;
}

export interface FxQuote {
  rate: string;
  estimated?: boolean;
}

export interface PriceLookup {
  stock(symbol: string): StockPrice | null;
  option(contractId: string): OptionMark | null;
  fx?(currency: string): FxQuote | null;
}

export interface StockHolding {
  symbol: string;
  currency: string;
  side: PositionSide;
  quantity: string;
  costBasis: string;
  rawCostBasis: string;
  averagePrice: string;
  price: string;
  priceEstimated: boolean;
  priceAsOf: string | null;
  marketValue: string;
  unrealized: string;
  realized: string;
  dividends: string;
  shortCosts: string;
  fxRate: string;
  fxEstimated: boolean;
  marketValueBase: string;
}

export interface OptionHolding {
  contractId: string;
  underlying: string;
  currency: string;
  side: PositionSide;
  contracts: string;
  openAmount: string;
  averagePremium: string;
  mark: string;
  markEstimated: boolean;
  markSource: string | null;
  markAsOf: string | null;
  marketValue: string;
  unrealized: string;
  realized: string;
  fxRate: string;
  marketValueBase: string;
  openingTxnIds: string[];
}

export interface PnlTotals {
  unrealizedStock: string;
  unrealizedOption: string;
  realizedStock: string;
  realizedOption: string;
  dividends: string;
  shortCosts: string;
  componentsTotal: string;
  totalReturn: string;
}

export interface PortfolioValuation {
  baseCurrency: string;
  stocksValue: string;
  optionsValue: string;
  positionsValue: string;
  marketValue: string;
  netContributions: string;
  stocks: StockHolding[];
  options: OptionHolding[];
  totals: PnlTotals;
  hasEstimatedValues: boolean;
}

const ZERO = new Dec(0);
const ONE = new Dec(1);

export function valueLedger(ledger: Ledger, prices: PriceLookup): PortfolioValuation {
  const base = ledger.baseCurrency;
  let estimated = false;

  const rateCache = new Map<string, { rate: Dec; estimated: boolean }>();
  const fxNow = (currency: string) => {
    if (currency === base) return { rate: ONE, estimated: false };
    let r = rateCache.get(currency);
    if (!r) {
      const q = prices.fx?.(currency) ?? null;
      r = q ? { rate: dec(q.rate), estimated: q.estimated === true } : { rate: ONE, estimated: true };
      rateCache.set(currency, r);
    }
    return r;
  };
  const toBase = (amount: Dec, currency: string) => amount.times(fxNow(currency).rate);
  const sumToBase = (totals: ReadonlyMap<string, Dec>) =>
    [...totals].reduce((acc, [currency, amount]) => acc.plus(toBase(amount, currency)), ZERO);

  let stocksValue = ZERO;
  let unrealizedStock = ZERO;
  let realizedStock = ZERO;
  let dividends = ZERO;
  let shortCosts = ZERO;
  const stocks: StockHolding[] = [];

  for (const pos of ledger.stocks.values()) {
    realizedStock = realizedStock.plus(toBase(pos.realized, pos.currency));
    dividends = dividends.plus(toBase(pos.dividends, pos.currency));
    shortCosts = shortCosts.plus(toBase(pos.shortCosts, pos.currency));
    const side = positionSide(pos.lots);
    const qty = openQty(pos.lots);
    if (!side || qty.isZero()) continue;

    const cost = totalAmount(pos.lots);
    const rawCost = totalAmount(pos.lots, 'rawAmount');
    const quoted = prices.stock(pos.symbol);
    let price: Dec;
    let priceEstimated: boolean;
    let priceAsOf: string | null = null;
    if (quoted) {
      price = dec(quoted.price);
      priceEstimated = quoted.estimated === true;
      priceAsOf = quoted.asOf ?? null;
    } else {
      price = pos.lastPrice ?? cost.div(qty);
      priceEstimated = true;
    }
    const fx = fxNow(pos.currency);
    estimated ||= priceEstimated || fx.estimated;

    const signedQty = side === 'LONG' ? qty : qty.negated();
    const marketValue = signedQty.times(price);
    const unrealized = side === 'LONG' ? marketValue.minus(cost) : cost.plus(marketValue);
    const marketValueBase = marketValue.times(fx.rate);
    stocksValue = stocksValue.plus(marketValueBase);
    unrealizedStock = unrealizedStock.plus(unrealized.times(fx.rate));
    stocks.push({
      symbol: pos.symbol,
      currency: pos.currency,
      side,
      quantity: signedQty.toFixed(),
      costBasis: cost.toFixed(),
      rawCostBasis: rawCost.toFixed(),
      averagePrice: pos.netInvested.div(signedQty).toFixed(),
      price: price.toFixed(),
      priceEstimated,
      priceAsOf,
      marketValue: marketValue.toFixed(),
      unrealized: unrealized.toFixed(),
      realized: pos.realized.toFixed(),
      dividends: pos.dividends.toFixed(),
      shortCosts: pos.shortCosts.toFixed(),
      fxRate: fx.rate.toFixed(),
      fxEstimated: fx.estimated,
      marketValueBase: marketValueBase.toFixed(),
    });
  }

  let optionsValue = ZERO;
  let unrealizedOption = ZERO;
  let realizedOption = ZERO;
  const options: OptionHolding[] = [];

  for (const pos of ledger.options.values()) {
    realizedOption = realizedOption.plus(toBase(pos.realized, pos.currency));
    const side = positionSide(pos.lots);
    const qty = openQty(pos.lots);
    if (!side || qty.isZero()) continue;

    const contract = ledger.opts.contracts.get(pos.contractId)!;
    const amount = totalAmount(pos.lots);
    const quoted = prices.option(pos.contractId);
    let mark: Dec;
    let markEstimated: boolean;
    let markSource: string | null;
    let markAsOf: string | null = null;
    if (quoted) {
      mark = dec(quoted.mark);
      markEstimated = quoted.estimated === true;
      markSource = quoted.source ?? null;
      markAsOf = quoted.asOf ?? null;
    } else {
      mark = pos.lastPrice ?? ZERO;
      markEstimated = true;
      markSource = 'TRADE';
    }
    const fx = fxNow(pos.currency);
    estimated ||= markEstimated || fx.estimated;

    const gross = qty.times(mark).times(contract.multiplier);
    const marketValue = side === 'LONG' ? gross : gross.negated();
    const unrealized = side === 'LONG' ? marketValue.minus(amount) : amount.plus(marketValue);
    const marketValueBase = marketValue.times(fx.rate);
    optionsValue = optionsValue.plus(marketValueBase);
    unrealizedOption = unrealizedOption.plus(unrealized.times(fx.rate));
    options.push({
      contractId: pos.contractId,
      underlying: pos.underlying,
      currency: pos.currency,
      side,
      contracts: qty.toFixed(),
      openAmount: amount.toFixed(),
      averagePremium: amount.div(qty.times(contract.multiplier)).toFixed(),
      mark: mark.toFixed(),
      markEstimated,
      markSource,
      markAsOf,
      marketValue: marketValue.toFixed(),
      unrealized: unrealized.toFixed(),
      realized: pos.realized.toFixed(),
      fxRate: fx.rate.toFixed(),
      marketValueBase: marketValueBase.toFixed(),
      openingTxnIds: [...pos.openings],
    });
  }

  const netContributions = sumToBase(ledger.netContributions);
  const positionsValue = stocksValue.plus(optionsValue);
  const marketValue = positionsValue;
  const componentsTotal = unrealizedStock
    .plus(unrealizedOption)
    .plus(realizedStock)
    .plus(realizedOption)
    .plus(dividends)
    .plus(shortCosts);

  return {
    baseCurrency: base,
    stocksValue: stocksValue.toFixed(),
    optionsValue: optionsValue.toFixed(),
    positionsValue: positionsValue.toFixed(),
    marketValue: marketValue.toFixed(),
    netContributions: netContributions.toFixed(),
    stocks,
    options,
    totals: {
      unrealizedStock: unrealizedStock.toFixed(),
      unrealizedOption: unrealizedOption.toFixed(),
      realizedStock: realizedStock.toFixed(),
      realizedOption: realizedOption.toFixed(),
      dividends: dividends.toFixed(),
      shortCosts: shortCosts.toFixed(),
      componentsTotal: componentsTotal.toFixed(),
      totalReturn: marketValue.minus(netContributions).toFixed(),
    },
    hasEstimatedValues: estimated,
  };
}
