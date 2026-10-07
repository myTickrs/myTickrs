import { isOpeningTrade, type TransactionType } from '@tickrs/shared';
import { cashEffect, currencyOf } from './cash.js';
import { contractFor, isCashSettled, settlementCash } from './contracts.js';
import { Dec } from './decimal.js';
import { LedgerError } from './errors.js';
import { feeOf, nonNegative, optional, positive } from './fields.js';
import { type Lot, openQty, scaleLots, sumTaken, takeFifo } from './lots.js';
import { orderLedger } from './ordering.js';
import type { IsoDate, LedgerOptions, LedgerTxn, PositionSide } from './types.js';

export interface RealizedEvent {
  date: IsoDate;
  txnId: string;
  closeType: TransactionType;
  kind: 'STOCK' | 'OPTION';
  symbol: string;
  contractId: string | null;
  currency: string;
  amount: string;
  rolledIntoStock: boolean;
  side: PositionSide | null;
  contracts: string | null;
  carriedIn: boolean;
}

export type LedgerWarningCode = 'NEGATIVE_STOCK' | 'MISSING_LINKED_TRADE' | 'BUY_COVERS_SHORT';

export interface LedgerWarning {
  code: LedgerWarningCode;
  txnId: string;
  message: string;
}

export interface StockPosition {
  symbol: string;
  currency: string;
  lots: Lot[];
  realized: Dec;
  dividends: Dec;
  shortCosts: Dec;
  hasBeenShort: boolean;
  lastPrice: Dec | null;
  netInvested: Dec;
}

export interface OptionPosition {
  contractId: string;
  underlying: string;
  currency: string;
  lots: Lot[];
  realized: Dec;
  rolledPremium: Dec;
  lastPrice: Dec | null;
  lastTradeDate: IsoDate | null;
  openedBy: string | null;
  openings: string[];
}

interface PendingLink {
  eventType: TransactionType;
  contractId: string;
  underlying: string;
  eventTxnId: string;
  date: IsoDate;
  signedPremium: Dec;
  eventFee: Dec;
  side: PositionSide;
  contracts: Dec;
}

const ZERO = new Dec(0);
const ONE = new Dec(1);

function carriedIn(t: LedgerTxn): Dec | null {
  if (!t.realizedBefore || !isOpeningTrade(t.type)) return null;
  const amount = new Dec(t.realizedBefore);
  return amount.isZero() ? null : amount;
}
const NO_LINK = { signedPremium: ZERO, eventFee: ZERO };

export function positionSide(lots: readonly Lot[]): PositionSide | null {
  return lots[0]?.side ?? null;
}

function signedShares(lots: readonly Lot[]): Dec {
  const qty = openQty(lots);
  return positionSide(lots) === 'SHORT' ? qty.negated() : qty;
}

function splitShare(total: Dec, part: Dec, whole: Dec): [Dec, Dec] {
  if (part.eq(whole)) return [total, ZERO];
  if (part.isZero()) return [ZERO, total];
  const portion = total.times(part.div(whole));
  return [portion, total.minus(portion)];
}

function addTo(totals: Map<string, Dec>, currency: string, amount: Dec): void {
  totals.set(currency, (totals.get(currency) ?? ZERO).plus(amount));
}

export class Ledger {
  readonly baseCurrency: string;
  readonly netContributions = new Map<string, Dec>();
  readonly stocks = new Map<string, StockPosition>();
  readonly options = new Map<string, OptionPosition>();
  readonly realized: RealizedEvent[] = [];
  readonly optionPositionOf = new Map<string, string>();
  readonly warnings: LedgerWarning[] = [];
  private readonly pending = new Map<string, PendingLink>();

  constructor(readonly opts: LedgerOptions) {
    this.baseCurrency = opts.baseCurrency ?? 'USD';
  }

  apply(t: LedgerTxn): void {
    const currency = currencyOf(t, this.baseCurrency);
    const delta = cashEffect(t, this.opts.contracts);

    switch (t.assetClass) {
      case 'STOCK':
        this.applyStock(t, currency, delta);
        break;
      case 'OPTION':
        this.applyOption(t, currency);
        break;
    }
    if (!delta.isZero()) addTo(this.netContributions, currency, delta.negated());
  }

  settlePending(): void {
    for (const p of this.pending.values()) {
      const pos = this.options.get(p.contractId)!;
      const amount = p.signedPremium.minus(p.eventFee);
      pos.realized = pos.realized.plus(amount);
      pos.rolledPremium = pos.rolledPremium.minus(p.signedPremium);
      this.recordRealized({
        date: p.date,
        txnId: p.eventTxnId,
        closeType: p.eventType,
        kind: 'OPTION',
        symbol: p.underlying,
        contractId: p.contractId,
        currency: pos.currency,
        amount,
        rolledIntoStock: false,
        side: p.side,
        contracts: p.contracts,
        carriedIn: false,
      });
      this.warnings.push({
        code: 'MISSING_LINKED_TRADE',
        txnId: p.eventTxnId,
        message: 'Assignment/exercise has no linked stock trade; premium realized on the option instead',
      });
    }
    this.pending.clear();
  }

  private stock(t: LedgerTxn, currency: string): StockPosition {
    if (!t.symbol) throw new LedgerError('INVALID_TRANSACTION', t.id, `${t.type} requires a symbol`);
    let pos = this.stocks.get(t.symbol);
    if (!pos) {
      pos = {
        symbol: t.symbol,
        currency,
        lots: [],
        realized: ZERO,
        dividends: ZERO,
        shortCosts: ZERO,
        hasBeenShort: false,
        lastPrice: null,
        netInvested: ZERO,
      };
      this.stocks.set(t.symbol, pos);
    } else if (pos.currency !== currency) {
      throw new LedgerError(
        'CURRENCY_MISMATCH',
        t.id,
        `${t.symbol} trades in ${pos.currency}, but this transaction is in ${currency}`,
      );
    }
    return pos;
  }

  private takeLink(t: LedgerTxn): Pick<PendingLink, 'signedPremium' | 'eventFee'> {
    if (!t.isSystemGenerated || !t.linkedTxnId) return NO_LINK;
    const link = this.pending.get(t.linkedTxnId);
    if (!link) return NO_LINK;
    this.pending.delete(t.linkedTxnId);
    return link;
  }

  private applyStock(t: LedgerTxn, currency: string, delta: Dec): void {
    const pos = this.stock(t, currency);
    const before = signedShares(pos.lots);
    this.applyStockRow(t, pos);
    this.addNetInvested(pos, before, signedShares(pos.lots), delta.negated());
    const carried = carriedIn(t);
    if (carried) {
      pos.realized = pos.realized.plus(carried);
      this.recordRealized({
        date: t.tradeDate,
        txnId: t.id,
        closeType: t.type,
        kind: 'STOCK',
        symbol: pos.symbol,
        contractId: null,
        currency: pos.currency,
        amount: carried,
        rolledIntoStock: false,
        side: null,
        contracts: null,
        carriedIn: true,
      });
    }
  }

  private addNetInvested(pos: StockPosition, before: Dec, after: Dec, invested: Dec): void {
    if (this.opts.averagePriceScope !== 'CURRENT' || after.isZero()) {
      pos.netInvested = pos.netInvested.plus(invested);
    } else if (before.isZero()) {
      pos.netInvested = invested;
    } else if (before.isNegative() !== after.isNegative()) {
      const opened = after.abs();
      [pos.netInvested] = splitShare(invested, opened, opened.plus(before.abs()));
    } else {
      pos.netInvested = pos.netInvested.plus(invested);
    }
  }

  private applyStockRow(t: LedgerTxn, pos: StockPosition): void {
    switch (t.type) {
      case 'BUY':
        return this.stockBuy(t, pos);
      case 'SELL':
        return this.stockSell(t, pos);
      case 'SELL_SHORT':
        return this.stockSellShort(t, pos);
      case 'BUY_TO_COVER':
        return this.stockBuyToCover(t, pos);
      case 'DIV_CASH': {
        const net = positive(t, 'amount').minus(feeOf(t));
        pos.dividends = pos.dividends.plus(net);
        return;
      }
      case 'DIV_PAID': {
        this.requireShortHistory(t, pos);
        pos.dividends = pos.dividends.minus(positive(t, 'amount').plus(feeOf(t)));
        return;
      }
      case 'BORROW_FEE': {
        this.requireShortHistory(t, pos);
        const cost = positive(t, 'amount').plus(feeOf(t));
        if (this.opts.borrowFeeTreatment === 'SEPARATE') pos.shortCosts = pos.shortCosts.minus(cost);
        else this.realizeStock(t, pos, cost.negated());
        return;
      }
      case 'DIV_REINVEST': {
        if (positionSide(pos.lots) === 'SHORT') {
          throw new LedgerError(
            'INVALID_TRANSACTION',
            t.id,
            'Cannot reinvest a dividend into a short position',
          );
        }
        const q = positive(t, 'quantity');
        const p = nonNegative(t, 'price');
        const value = q.times(p);
        const cost = value.plus(feeOf(t));
        pos.dividends = pos.dividends.plus(value);
        this.openStockLot(pos, t, 'LONG', q, cost, cost);
        pos.lastPrice = p;
        return;
      }
      case 'SPLIT': {
        const ratio = positive(t, 'splitTo').div(positive(t, 'splitFrom'));
        pos.lots = scaleLots(pos.lots, ratio);
        if (pos.lastPrice) pos.lastPrice = pos.lastPrice.div(ratio);
        return;
      }
      default:
        throw new LedgerError('INVALID_TRANSACTION', t.id, `${t.type} is not a stock transaction`);
    }
  }

  private openStockLot(
    pos: StockPosition,
    t: LedgerTxn,
    side: PositionSide,
    qty: Dec,
    amount: Dec,
    rawAmount: Dec,
  ) {
    pos.lots.push({ txnId: t.id, openDate: t.tradeDate, side, qty, amount, rawAmount });
    if (side === 'SHORT') pos.hasBeenShort = true;
  }

  private requireShortHistory(t: LedgerTxn, pos: StockPosition): void {
    if (!pos.hasBeenShort && !this.opts.acrossAccounts) {
      throw new LedgerError(
        'INVALID_TRANSACTION',
        t.id,
        `${pos.symbol} has not been short on or before ${t.tradeDate}`,
      );
    }
  }

  private stockSellShort(t: LedgerTxn, pos: StockPosition): void {
    const q = positive(t, 'quantity');
    const p = nonNegative(t, 'price');
    const long = positionSide(pos.lots) === 'LONG' ? openQty(pos.lots) : ZERO;
    if (!long.isZero() && !this.opts.acrossAccounts) {
      throw new LedgerError(
        'INVALID_TRANSACTION',
        t.id,
        `Cannot sell ${pos.symbol} short while ${long.toFixed()} shares are held: sell them first`,
      );
    }
    const proceeds = q.times(p).minus(feeOf(t));
    const closeQty = Dec.min(q, long);
    const [closeProceeds, shortProceeds] = splitShare(proceeds, closeQty, q);
    if (!closeQty.isZero()) {
      const { taken, remaining } = takeFifo(pos.lots, closeQty);
      pos.lots = remaining;
      this.realizeStock(t, pos, closeProceeds.minus(sumTaken(taken)));
    }
    const shortQty = q.minus(closeQty);
    if (!shortQty.isZero()) this.openStockLot(pos, t, 'SHORT', shortQty, shortProceeds, shortProceeds);
    pos.lastPrice = p;
  }

  private stockBuyToCover(t: LedgerTxn, pos: StockPosition): void {
    const q = positive(t, 'quantity');
    const p = nonNegative(t, 'price');
    const short = positionSide(pos.lots) === 'SHORT' ? openQty(pos.lots) : ZERO;
    if (q.gt(short) && !this.opts.acrossAccounts) {
      throw new LedgerError(
        'INSUFFICIENT_POSITION',
        t.id,
        `Cannot cover ${q.toFixed()} ${pos.symbol}: only ${short.toFixed()} short on ${t.tradeDate}`,
      );
    }
    const cost = q.times(p).plus(feeOf(t));
    const coverQty = Dec.min(q, short);
    const [coverCost, longCost] = splitShare(cost, coverQty, q);
    if (!coverQty.isZero()) {
      const { taken, remaining } = takeFifo(pos.lots, coverQty);
      pos.lots = remaining;
      this.realizeStock(t, pos, sumTaken(taken).minus(coverCost));
    }
    const longQty = q.minus(coverQty);
    if (!longQty.isZero()) this.openStockLot(pos, t, 'LONG', longQty, longCost, longCost);
    pos.lastPrice = p;
  }

  private stockBuy(t: LedgerTxn, pos: StockPosition): void {
    const q = positive(t, 'quantity');
    const p = nonNegative(t, 'price');
    const link = this.takeLink(t);
    const gross = q.times(p).plus(feeOf(t)).minus(optional(t, 'amount'));
    const rawCost = gross.plus(link.eventFee);
    const cost = rawCost.minus(link.signedPremium);

    const coverQty = positionSide(pos.lots) === 'SHORT' ? Dec.min(q, openQty(pos.lots)) : ZERO;
    const [coverCost, longCost] = splitShare(cost, coverQty, q);
    const [, longRaw] = splitShare(rawCost, coverQty, q);
    if (!coverQty.isZero()) {
      const { taken, remaining } = takeFifo(pos.lots, coverQty);
      pos.lots = remaining;
      this.realizeStock(t, pos, sumTaken(taken).minus(coverCost));
      if (!t.isSystemGenerated) {
        this.warnings.push({
          code: 'BUY_COVERS_SHORT',
          txnId: t.id,
          message: `This buy covers ${coverQty.toFixed()} ${pos.symbol} sold short: use Buy to cover`,
        });
      }
    }
    const longQty = q.minus(coverQty);
    if (!longQty.isZero()) this.openStockLot(pos, t, 'LONG', longQty, longCost, longRaw);
    pos.lastPrice = p;
  }

  private stockSell(t: LedgerTxn, pos: StockPosition): void {
    const q = positive(t, 'quantity');
    const p = nonNegative(t, 'price');
    const side = positionSide(pos.lots);
    const held = side === 'LONG' ? openQty(pos.lots) : ZERO;
    if (q.gt(held) && !t.isSystemGenerated) {
      throw new LedgerError(
        'INSUFFICIENT_POSITION',
        t.id,
        `Cannot sell ${q.toFixed()} ${pos.symbol}: only ${held.toFixed()} held on ${t.tradeDate}. To open a short, use Sell short`,
      );
    }
    const link = this.takeLink(t);
    const gross = q.times(p).minus(feeOf(t)).minus(optional(t, 'amount'));
    const rawProceeds = gross.minus(link.eventFee);
    const proceeds = rawProceeds.plus(link.signedPremium);

    const closeQty = Dec.min(q, held);
    const [closeProceeds, shortProceeds] = splitShare(proceeds, closeQty, q);
    const [, shortRaw] = splitShare(rawProceeds, closeQty, q);
    if (!closeQty.isZero()) {
      const { taken, remaining } = takeFifo(pos.lots, closeQty);
      pos.lots = remaining;
      this.realizeStock(t, pos, closeProceeds.minus(sumTaken(taken)));
    }
    const excess = q.minus(closeQty);
    if (!excess.isZero()) {
      this.openStockLot(pos, t, 'SHORT', excess, shortProceeds, shortRaw);
      this.warnings.push({
        code: 'NEGATIVE_STOCK',
        txnId: t.id,
        message: `${pos.symbol} position is now short ${openQty(pos.lots).toFixed()} shares`,
      });
    }
    pos.lastPrice = p;
  }

  private realizeStock(t: LedgerTxn, pos: StockPosition, amount: Dec): void {
    pos.realized = pos.realized.plus(amount);
    this.recordRealized({
      date: t.tradeDate,
      txnId: t.id,
      closeType: t.type,
      kind: 'STOCK',
      symbol: pos.symbol,
      contractId: null,
      currency: pos.currency,
      amount,
      rolledIntoStock: false,
      side: null,
      contracts: null,
      carriedIn: false,
    });
  }

  private option(t: LedgerTxn, contractId: string, underlying: string, currency: string): OptionPosition {
    let pos = this.options.get(contractId);
    if (!pos) {
      pos = {
        contractId,
        underlying,
        currency,
        lots: [],
        realized: ZERO,
        rolledPremium: ZERO,
        lastPrice: null,
        lastTradeDate: null,
        openedBy: null,
        openings: [],
      };
      this.options.set(contractId, pos);
    } else if (pos.currency !== currency) {
      throw new LedgerError(
        'CURRENCY_MISMATCH',
        t.id,
        `This contract trades in ${pos.currency}, not ${currency}`,
      );
    }
    return pos;
  }

  private requireOpen(t: LedgerTxn, pos: OptionPosition, side: PositionSide, qty: Dec): void {
    const open = positionSide(pos.lots) === side ? openQty(pos.lots) : ZERO;
    if (qty.gt(open)) {
      throw new LedgerError(
        'INSUFFICIENT_POSITION',
        t.id,
        `${t.type} of ${qty.toFixed()} contracts exceeds the ${open.toFixed()} ${side.toLowerCase()} contracts open on ${t.tradeDate}`,
      );
    }
  }

  private closeOption(pos: OptionPosition, qty: Dec): Dec {
    const { taken, remaining } = takeFifo(pos.lots, qty);
    pos.lots = remaining;
    return sumTaken(taken);
  }

  private applyOption(t: LedgerTxn, currency: string): void {
    const c = contractFor(t, this.opts.contracts);
    const pos = this.option(t, c.id, c.underlying, currency);
    const fee = feeOf(t);
    const side = positionSide(pos.lots);
    if (t.type === 'BTO' || t.type === 'STO') {
      if (!side) {
        pos.openedBy = t.id;
        pos.openings = [];
      }
      pos.openings.push(t.id);
    }
    if (pos.openedBy) this.optionPositionOf.set(t.id, pos.openedBy);
    const record = (
      amount: Dec,
      closed: { side: PositionSide; qty: Dec },
      rolled = false,
      carried = false,
    ) => {
      pos.realized = pos.realized.plus(amount);
      this.recordRealized({
        date: t.tradeDate,
        txnId: t.id,
        closeType: t.type,
        kind: 'OPTION',
        symbol: c.underlying,
        contractId: c.id,
        currency,
        amount,
        rolledIntoStock: rolled,
        side: closed.side,
        contracts: closed.qty,
        carriedIn: carried,
      });
    };

    switch (t.type) {
      case 'BTO':
      case 'STO': {
        const opening: PositionSide = t.type === 'BTO' ? 'LONG' : 'SHORT';
        if (side && side !== opening) {
          throw new LedgerError(
            'OPPOSITE_POSITION_OPEN',
            t.id,
            `${t.type} while ${side.toLowerCase()} contracts are open; use ${opening === 'LONG' ? 'BTC' : 'STC'} to close them`,
          );
        }
        const q = positive(t, 'quantity');
        const p = nonNegative(t, 'price');
        const premium = q.times(p).times(c.multiplier);
        const amount = opening === 'LONG' ? premium.plus(fee) : premium.minus(fee);
        pos.lots.push({
          txnId: t.id,
          openDate: t.tradeDate,
          side: opening,
          qty: q,
          amount,
          rawAmount: amount,
        });
        pos.lastPrice = p;
        pos.lastTradeDate = t.tradeDate;
        const carried = carriedIn(t);
        if (carried) record(carried, { side: opening, qty: ZERO }, false, true);
        return;
      }
      case 'BTC':
      case 'STC': {
        const closingSide: PositionSide = t.type === 'BTC' ? 'SHORT' : 'LONG';
        const q = positive(t, 'quantity');
        const p = nonNegative(t, 'price');
        this.requireOpen(t, pos, closingSide, q);
        const premium = q.times(p).times(c.multiplier);
        const open = this.closeOption(pos, q);
        const closed = { side: closingSide, qty: q };
        if (closingSide === 'SHORT') record(open.minus(premium.plus(fee)), closed);
        else record(premium.minus(fee).minus(open), closed);
        pos.lastPrice = p;
        pos.lastTradeDate = t.tradeDate;
        return;
      }
      case 'EXP': {
        if (!side) throw new LedgerError('INSUFFICIENT_POSITION', t.id, 'EXP with no open contracts');
        const q = t.quantity == null ? openQty(pos.lots) : positive(t, 'quantity');
        this.requireOpen(t, pos, side, q);
        const open = this.closeOption(pos, q);
        const sign = side === 'SHORT' ? ONE : ONE.negated();
        record(open.times(sign).minus(fee), { side, qty: q });
        return;
      }
      case 'ASN':
      case 'EXR': {
        const closingSide: PositionSide = t.type === 'ASN' ? 'SHORT' : 'LONG';
        const q = positive(t, 'quantity');
        this.requireOpen(t, pos, closingSide, q);
        const open = this.closeOption(pos, q);
        const sign = closingSide === 'SHORT' ? ONE : ONE.negated();
        const signedPremium = open.times(sign);
        if (isCashSettled(c)) {
          record(signedPremium.plus(settlementCash(t, c)).minus(fee), { side: closingSide, qty: q });
          return;
        }
        const base = {
          eventType: t.type,
          contractId: c.id,
          underlying: c.underlying,
          eventTxnId: t.id,
          date: t.tradeDate,
          side: closingSide,
          contracts: q,
        };
        if (this.opts.premiumTreatment === 'ROLL_INTO_STOCK') {
          record(ZERO, { side: closingSide, qty: q }, true);
          pos.rolledPremium = pos.rolledPremium.plus(signedPremium);
          this.pending.set(t.id, { ...base, signedPremium, eventFee: fee });
        } else {
          record(signedPremium, { side: closingSide, qty: q });
          this.pending.set(t.id, { ...base, signedPremium: ZERO, eventFee: fee });
        }
        return;
      }
      default:
        throw new LedgerError('INVALID_TRANSACTION', t.id, `${t.type} is not an option transaction`);
    }
  }

  private recordRealized(
    e: Omit<RealizedEvent, 'amount' | 'contracts'> & { amount: Dec; contracts: Dec | null },
  ): void {
    this.realized.push({ ...e, amount: e.amount.toFixed(), contracts: e.contracts?.toFixed() ?? null });
  }
}

export function replay(txns: readonly LedgerTxn[], opts: LedgerOptions): Ledger {
  const ledger = new Ledger(opts);
  for (const t of orderLedger(txns)) ledger.apply(t);
  ledger.settlePending();
  return ledger;
}

export function validateLedger(txns: readonly LedgerTxn[], opts: LedgerOptions): LedgerError | null {
  try {
    replay(txns, opts);
    return null;
  } catch (err) {
    if (err instanceof LedgerError) return err;
    throw err;
  }
}
