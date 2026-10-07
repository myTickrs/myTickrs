import type { OptionRight } from '@tickrs/shared';
import { isCashSettled } from './contracts.js';
import { daysBetween } from './dates.js';
import { Dec, dec, type DecimalInput } from './decimal.js';
import { LedgerError } from './errors.js';
import { positive } from './fields.js';
import { type Ledger, positionSide } from './ledger.js';
import { openQty } from './lots.js';
import type { EffectiveContract, IsoDate, LedgerTxn, PositionSide } from './types.js';

export function intrinsicValue(right: OptionRight, strike: DecimalInput, underlying: DecimalInput): Dec {
  const diff = right === 'CALL' ? dec(underlying).minus(dec(strike)) : dec(strike).minus(dec(underlying));
  return Dec.max(diff, 0);
}

export type Moneyness = 'ITM' | 'ATM' | 'OTM';

export function moneyness(right: OptionRight, strike: DecimalInput, underlying: DecimalInput): Moneyness {
  const cmp = dec(underlying).comparedTo(dec(strike));
  if (cmp === 0) return 'ATM';
  return (right === 'CALL' ? cmp > 0 : cmp < 0) ? 'ITM' : 'OTM';
}

export function breakEven(right: OptionRight, strike: DecimalInput, premiumPerShare: DecimalInput): Dec {
  return right === 'CALL' ? dec(strike).plus(dec(premiumPerShare)) : dec(strike).minus(dec(premiumPerShare));
}

export function daysToExpiration(expiration: IsoDate, asOf: IsoDate): number {
  return daysBetween(asOf, expiration);
}

export function returnOnRisk(
  netPremium: DecimalInput,
  strike: DecimalInput,
  deliverableShares: DecimalInput,
  contracts: DecimalInput,
  dte: number,
): { returnOnRisk: Dec; annualized: Dec | null } {
  const risk = dec(strike).times(dec(deliverableShares)).times(dec(contracts));
  const ror = risk.isZero() ? new Dec(0) : dec(netPremium).div(risk);
  return { returnOnRisk: ror, annualized: dte > 0 ? ror.times(365).div(dte) : null };
}

export function lifecycleStockSide(type: 'ASN' | 'EXR', right: OptionRight): 'BUY' | 'SELL' {
  if (type === 'ASN') return right === 'PUT' ? 'BUY' : 'SELL';
  return right === 'CALL' ? 'BUY' : 'SELL';
}

export function linkedStockTrade(event: LedgerTxn, contract: EffectiveContract): Omit<LedgerTxn, 'id'> {
  if (event.type !== 'ASN' && event.type !== 'EXR') {
    throw new LedgerError('INVALID_TRANSACTION', event.id, 'Only ASN/EXR generate a stock trade');
  }
  if (isCashSettled(contract)) {
    throw new LedgerError('INVALID_TRANSACTION', event.id, 'A cash-settled contract delivers no shares');
  }
  const contracts = positive(event, 'quantity');
  const cashInLieu = dec(contract.cashInLieu).times(contracts);
  return {
    assetClass: 'STOCK',
    type: lifecycleStockSide(event.type, contract.right),
    tradeDate: event.tradeDate,
    symbol: contract.underlying,
    optionContractId: null,
    quantity: contracts.times(contract.deliverableShares).toFixed(),
    price: contract.strike,
    fee: '0',
    amount: cashInLieu.isZero() ? null : cashInLieu.toFixed(),
    linkedTxnId: event.id,
    isSystemGenerated: true,
  };
}

export function suggestExpirationOutcome(
  contract: Pick<EffectiveContract, 'right' | 'strike'>,
  side: PositionSide,
  underlyingClose: DecimalInput,
): { outcome: 'EXP' | 'ASN' | 'EXR'; moneyness: Moneyness } {
  const m = moneyness(contract.right, contract.strike, underlyingClose);
  if (m !== 'ITM') return { outcome: 'EXP', moneyness: m };
  return { outcome: side === 'SHORT' ? 'ASN' : 'EXR', moneyness: m };
}

export interface ExpiredOpenPosition {
  contractId: string;
  underlying: string;
  expiration: IsoDate;
  side: PositionSide;
  contracts: string;
}

export function expiredOpenPositions(ledger: Ledger, asOf: IsoDate): ExpiredOpenPosition[] {
  const out: ExpiredOpenPosition[] = [];
  for (const pos of ledger.options.values()) {
    const side = positionSide(pos.lots);
    const contract = ledger.opts.contracts.get(pos.contractId);
    if (!side || !contract || contract.expiration >= asOf) continue;
    out.push({
      contractId: pos.contractId,
      underlying: pos.underlying,
      expiration: contract.expiration,
      side,
      contracts: openQty(pos.lots).toFixed(),
    });
  }
  return out.toSorted((a, b) => (a.expiration < b.expiration ? -1 : a.expiration > b.expiration ? 1 : 0));
}

export interface ShortCall {
  contractId: string;
  expiration: IsoDate;
  contracts: string;
  deliverableShares: string;
}

export interface CoverageStatus {
  contractId: string;
  coveredContracts: string;
  nakedContracts: string;
  status: 'COVERED' | 'PARTIAL' | 'NAKED';
}

export function callCoverage(sharesHeld: DecimalInput, shortCalls: readonly ShortCall[]): CoverageStatus[] {
  let available = Dec.max(dec(sharesHeld), 0);
  return shortCalls
    .toSorted((a, b) => (a.expiration < b.expiration ? -1 : a.expiration > b.expiration ? 1 : 0))
    .map((c) => {
      const contracts = dec(c.contracts);
      const perContract = dec(c.deliverableShares);
      const covered = Dec.min(contracts, available.div(perContract).floor());
      available = available.minus(covered.times(perContract));
      const naked = contracts.minus(covered);
      return {
        contractId: c.contractId,
        coveredContracts: covered.toFixed(),
        nakedContracts: naked.toFixed(),
        status: naked.isZero() ? 'COVERED' : covered.isZero() ? 'NAKED' : 'PARTIAL',
      };
    });
}
