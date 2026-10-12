import type {
  AssetClass,
  AveragePriceScope,
  BorrowFeeTreatment,
  OptionRight,
  OptionSettlement,
  OptionStyle,
  PremiumTreatment,
  TransactionType,
} from '@tickrs/shared';

export type IsoDate = string;
export type DecimalString = string;

export interface LedgerTxn {
  id: string;
  assetClass: AssetClass;
  type: TransactionType;
  tradeDate: IsoDate;
  symbol: string | null;
  optionContractId?: string | null;
  quantity?: DecimalString | null;
  price?: DecimalString | null;
  fee?: DecimalString | null;
  amount?: DecimalString | null;
  splitFrom?: DecimalString | null;
  splitTo?: DecimalString | null;
  realizedBefore?: DecimalString | null;
  linkedTxnId?: string | null;
  isSystemGenerated?: boolean;
  currency?: string | null;
}

export interface OptionContract {
  id: string;
  underlying: string;
  expiration: IsoDate;
  strike: DecimalString;
  right: OptionRight;
  multiplier: DecimalString;
  style?: OptionStyle;
  settlement?: OptionSettlement;
}

export interface ContractAdjustment {
  multiplier?: DecimalString | null;
  deliverableShares?: DecimalString | null;
  cashInLieu?: DecimalString | null;
  strike?: DecimalString | null;
  quoteSymbol?: string | null;
  displayName?: string | null;
}

export interface EffectiveContract extends OptionContract {
  deliverableShares: DecimalString;
  cashInLieu: DecimalString;
  quoteSymbol: string | null;
  displayName: string | null;
  isAdjusted: boolean;
  original: OptionContract;
}

export interface LedgerOptions {
  baseCurrency?: string;
  averagePriceScope?: AveragePriceScope;
  premiumTreatment: PremiumTreatment;
  borrowFeeTreatment?: BorrowFeeTreatment;
  acrossAccounts?: boolean;
  contracts: ReadonlyMap<string, EffectiveContract>;
}

export type PositionSide = 'LONG' | 'SHORT';
