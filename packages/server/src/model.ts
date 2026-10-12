import type {
  AssetClass,
  BorrowFeeTreatment,
  MarketId,
  FeeSource,
  CorporateActionType,
  AveragePriceScope,
  OptionDataSource,
  OptionRight,
  OptionSettlement,
  OptionStyle,
  PremiumTreatment,
  ProviderKeyStatus,
  SecurityType,
  ShortBuyHandling,
  StrategyGroupKind,
  StrategyTag,
  TransactionType,
} from '@tickrs/shared';
import type { Generated } from 'kysely';

export type DecimalString = string;
export type IsoDate = string;
export type IsoTimestamp = string;
export type Uuid = string;
export type Flag = 0 | 1;

export interface UsersTable {
  id: Uuid;
  email: string | null;
  baseCurrency: Generated<string>;
  averagePriceScope: Generated<AveragePriceScope>;
  optionPremiumTreatment: Generated<PremiumTreatment>;
  autoExpireOtm: Generated<Flag>;
  shortBuyHandling: Generated<ShortBuyHandling>;
  borrowFeeTreatment: Generated<BorrowFeeTreatment>;
  optionDataSource: Generated<OptionDataSource>;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface CurrenciesTable {
  userId: Uuid;
  code: string;
  name: string;
  createdAt: IsoTimestamp;
}

export interface AccountsTable {
  id: Uuid;
  userId: Uuid;
  name: string;
  broker: string | null;
  currency: Generated<string>;
  feeScheduleId: Uuid | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface FeeSchedulesTable {
  id: Uuid;
  userId: Uuid;
  name: string;
  presetKey: string | null;
  stockPerOrder: DecimalString | null;
  stockPerShare: DecimalString | null;
  stockMinPerOrder: DecimalString | null;
  stockMaxPerOrder: DecimalString | null;
  stockMaxPctOfValue: DecimalString | null;
  optionPerOrder: DecimalString | null;
  optionPerContract: DecimalString | null;
  optionMinPerOrder: DecimalString | null;
  optionMaxPerOrder: DecimalString | null;
  assignmentFee: DecimalString | null;
  exerciseFee: DecimalString | null;
  secFeeRate: DecimalString | null;
  tafPerShare: DecimalString | null;
  tafPerContract: DecimalString | null;
  tafMaxPerTrade: DecimalString | null;
  orfPerContract: DecimalString | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface SecuritiesTable {
  symbol: string;
  exchange: string | null;
  name: string;
  currency: Generated<string>;
  type: SecurityType;
  sector: string | null;
  updatedAt: IsoTimestamp;
}

export interface OptionContractsTable {
  id: Uuid;
  contractKey: string;
  underlyingSymbol: string;
  expiration: IsoDate;
  strike: DecimalString;
  optionRight: OptionRight;
  multiplier: Generated<DecimalString>;
  style: Generated<OptionStyle>;
  settlement: Generated<OptionSettlement>;
  createdAt: IsoTimestamp;
}

export interface StrategyGroupsTable {
  id: Uuid;
  userId: Uuid;
  kind: StrategyGroupKind;
  strategyTag: StrategyTag | null;
  name: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface TransactionsTable {
  id: Uuid;
  accountId: Uuid;
  assetClass: AssetClass;
  symbol: string;
  optionContractId: Uuid | null;
  type: TransactionType;
  tradeDate: IsoDate;
  quantity: DecimalString | null;
  price: DecimalString | null;
  fee: Generated<DecimalString>;
  amount: DecimalString | null;
  splitFrom: DecimalString | null;
  splitTo: DecimalString | null;
  currency: Generated<string>;
  linkedTxnId: Uuid | null;
  isSystemGenerated: Generated<Flag>;
  isAutoExpired: Generated<Flag>;
  feeSource: Generated<FeeSource>;
  feeCommission: DecimalString | null;
  feeRegulatory: DecimalString | null;
  realizedBefore: DecimalString | null;
  strategyGroupId: Uuid | null;
  strategyTag: StrategyTag | null;
  notes: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface ManualOptionMarksTable {
  userId: Uuid;
  optionContractId: Uuid;
  mark: DecimalString;
  asOf: IsoDate;
  updatedAt: IsoTimestamp;
}

export interface OptionContractAdjustmentsTable {
  userId: Uuid;
  optionContractId: Uuid;
  multiplier: DecimalString | null;
  deliverableShares: DecimalString | null;
  cashInLieu: DecimalString | null;
  strike: DecimalString | null;
  quoteSymbol: string | null;
  displayName: string | null;
  note: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface UserProviderKeysTable {
  userId: Uuid;
  provider: string;
  market: string;
  apiKeyCiphertext: string;
  apiKeyIv: string;
  apiKeyAuthTag: string;
  keyHint: string;
  enabled: Generated<Flag>;
  status: Generated<ProviderKeyStatus>;
  lastVerifiedAt: IsoTimestamp | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface MarketsTable {
  userId: Uuid;
  code: string;
  position: number;
  name: string;
  country: string | null;
  timezone: string;
  sessions: string;
  weekdays: string;
  closedDays: string;
  holidaysThrough: number | null;
  currency: string;
  suffixes: string;
  testSymbol: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface UserMarketProvidersTable {
  userId: Uuid;
  market: MarketId;
  provider: string;
  priority: number;
  enabled: Flag;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface ProviderUsageTable {
  userId: Uuid;
  provider: string;
  market: string;
  date: IsoDate;
  requestCount: Generated<number>;
}

export interface PriceDailyTable {
  symbol: string;
  date: IsoDate;
  open: DecimalString | null;
  high: DecimalString | null;
  low: DecimalString | null;
  close: DecimalString;
  adjClose: DecimalString | null;
  volume: DecimalString | null;
  source: string;
}

export interface PriceLatestTable {
  symbol: string;
  price: DecimalString;
  change: DecimalString | null;
  changePct: DecimalString | null;
  open: DecimalString | null;
  high: DecimalString | null;
  low: DecimalString | null;
  previousClose: DecimalString | null;
  source: string;
  asOf: IsoTimestamp;
  fetchedAt: IsoTimestamp;
}

export interface OptionQuoteDailyTable {
  ownerId: Uuid;
  optionContractId: Uuid;
  date: IsoDate;
  bid: DecimalString | null;
  ask: DecimalString | null;
  last: DecimalString | null;
  mark: DecimalString | null;
  volume: DecimalString | null;
  openInterest: DecimalString | null;
  iv: DecimalString | null;
  delta: DecimalString | null;
  theta: DecimalString | null;
  source: string;
}

export interface OptionQuoteLatestTable {
  ownerId: Uuid;
  optionContractId: Uuid;
  bid: DecimalString | null;
  ask: DecimalString | null;
  last: DecimalString | null;
  mark: DecimalString | null;
  iv: DecimalString | null;
  delta: DecimalString | null;
  gamma: DecimalString | null;
  theta: DecimalString | null;
  vega: DecimalString | null;
  previousClose: DecimalString | null;
  source: string;
  asOf: IsoTimestamp;
  fetchedAt: IsoTimestamp;
}

export interface FxDailyTable {
  base: string;
  quote: string;
  date: IsoDate;
  rate: DecimalString;
  source: string;
}

export interface CorporateActionsTable {
  symbol: string;
  date: IsoDate;
  type: CorporateActionType;
  ratioFrom: DecimalString | null;
  ratioTo: DecimalString | null;
  amount: DecimalString | null;
  source: string;
}

export interface PortfolioSnapshotsTable {
  accountId: Uuid;
  date: IsoDate;
  positionsValue: DecimalString;
  marketValue: DecimalString;
  netContributions: DecimalString;
  twrIndex: DecimalString;
  isEstimated: Generated<Flag>;
}

export interface SessionsTable {
  sid: string;
  userId: Uuid;
  expiresAt: IsoTimestamp;
  data: string;
}

export interface ImportMappingsTable {
  userId: Uuid;
  fingerprint: string;
  format: string;
  mapping: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface SyncBaseTable {
  userId: Uuid;
  cloudUrl: string;
  account: string;
  localFingerprint: string;
  cloudFingerprint: string;
  syncedAt: IsoTimestamp;
}

export interface Database {
  users: UsersTable;
  currencies: CurrenciesTable;
  accounts: AccountsTable;
  feeSchedules: FeeSchedulesTable;
  securities: SecuritiesTable;
  optionContracts: OptionContractsTable;
  strategyGroups: StrategyGroupsTable;
  transactions: TransactionsTable;
  manualOptionMarks: ManualOptionMarksTable;
  optionContractAdjustments: OptionContractAdjustmentsTable;
  userProviderKeys: UserProviderKeysTable;
  markets: MarketsTable;
  userMarketProviders: UserMarketProvidersTable;
  providerUsage: ProviderUsageTable;
  priceDaily: PriceDailyTable;
  priceLatest: PriceLatestTable;
  optionQuoteDaily: OptionQuoteDailyTable;
  optionQuoteLatest: OptionQuoteLatestTable;
  fxDaily: FxDailyTable;
  corporateActions: CorporateActionsTable;
  portfolioSnapshots: PortfolioSnapshotsTable;
  sessions: SessionsTable;
  importMappings: ImportMappingsTable;
  syncBase: SyncBaseTable;
}
