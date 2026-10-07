import type { FeeSchedule } from '@tickrs/core';
import type {
  SecurityType,
  StockDataProviderId,
  StrategyGroupKind,
  StrategyTag,
  TransactionQuery,
} from '@tickrs/shared';
import type { Insertable, Selectable } from 'kysely';
import type {
  AccountsTable,
  CurrenciesTable,
  FeeSchedulesTable,
  FxDailyTable,
  OptionContractAdjustmentsTable,
  OptionContractsTable,
  SecuritiesTable,
  StrategyGroupsTable,
  TransactionsTable,
  UserProviderKeysTable,
  MarketsTable,
  UsersTable,
  IsoDate,
  IsoTimestamp,
  PortfolioSnapshotsTable,
  PriceDailyTable,
  OptionQuoteDailyTable,
  OptionQuoteLatestTable,
  PriceLatestTable,
  SyncBaseTable,
  Uuid,
} from '../model.js';
import type { EffectiveContract } from '@tickrs/core';
import type { FeeScheduleInput, MarketId, OptionSettlement, OptionStyle } from '@tickrs/shared';
import type { Principal } from '../context.js';

export type AccountRow = Selectable<AccountsTable>;
export type CurrencyRow = Selectable<CurrenciesTable>;
export type TxnRow = Selectable<TransactionsTable>;
export type NewTxnRow = Insertable<TransactionsTable>;
export type FxRow = Selectable<FxDailyTable>;
export type ProviderKeyRow = Selectable<UserProviderKeysTable>;
export type MarketRow = Selectable<MarketsTable>;
export type FeeScheduleRow = Selectable<FeeSchedulesTable>;
export type UserRow = Selectable<UsersTable>;
export type ContractRow = Selectable<OptionContractsTable>;
export type StoredAdjustmentRow = Selectable<OptionContractAdjustmentsTable>;
export type StrategyGroupRow = Selectable<StrategyGroupsTable>;

export interface AccountsPort {
  list(): Promise<AccountRow[]>;
  find(id: Uuid): Promise<AccountRow | undefined>;
  require(id: Uuid, lock?: boolean): Promise<AccountRow>;
  create(input: {
    name: string;
    broker?: string | null;
    currency?: string;
    feeScheduleId?: Uuid | null;
  }): Promise<AccountRow>;
  update(
    id: Uuid,
    input: Partial<{ name: string; broker: string | null; currency: string; feeScheduleId: Uuid | null }>,
  ): Promise<AccountRow>;
  delete(id: Uuid): Promise<void>;
  ids(): Promise<Uuid[]>;
}

export interface CurrenciesPort {
  list(): Promise<CurrencyRow[]>;
  add(rows: readonly { code: string; name: string }[]): Promise<void>;
  delete(code: string): Promise<void>;
  usage(): Promise<{ code: string; accounts: number; transactions: number }[]>;
}

export interface TransactionsPort {
  listForAccount(accountId: Uuid): Promise<TxnRow[]>;
  listForUser(): Promise<TxnRow[]>;
  find(id: Uuid): Promise<TxnRow | undefined>;
  findLinked(id: Uuid): Promise<TxnRow | undefined>;
  query(query: TransactionQuery): Promise<{ rows: TxnRow[]; total: number }>;
  insertMany(rows: readonly NewTxnRow[]): Promise<void>;
  update(id: Uuid, patch: Partial<NewTxnRow>): Promise<void>;
  deleteMany(ids: readonly Uuid[]): Promise<void>;
  referencedContractIds(accountId?: Uuid): Promise<Uuid[]>;
  lifecycleEvents(contractId: Uuid): Promise<{ id: Uuid; accountId: Uuid }[]>;
}

export interface OptionContractsPort {
  find(id: Uuid): Promise<OptionContractRow | undefined>;
  findByKey(contractKey: string): Promise<OptionContractRow | undefined>;
  ensure(parts: {
    underlying: string;
    expiration: IsoDate;
    strike: string;
    right: 'CALL' | 'PUT';
    multiplier?: string;
    style?: OptionStyle;
    settlement?: OptionSettlement;
  }): Promise<OptionContractRow>;
  effective(ids: readonly Uuid[]): Promise<Map<string, EffectiveContract>>;
  listAdjustments(contractIds?: readonly Uuid[]): Promise<StoredAdjustmentRow[]>;
  upsertAdjustment(contractId: Uuid, input: AdjustmentInput): Promise<void>;
  deleteAdjustment(contractId: Uuid): Promise<void>;
}

export type OptionContractRow = ContractRow;
export type SecurityRow = Selectable<SecuritiesTable>;

export interface AdjustmentInput {
  multiplier?: string | null;
  deliverableShares?: string | null;
  cashInLieu?: string | null;
  strike?: string | null;
  quoteSymbol?: string | null;
  displayName?: string | null;
  note?: string | null;
}

export interface AdjustmentRow extends AdjustmentInput {
  optionContractId: Uuid;
}

export interface SecuritiesPort {
  find(symbol: string): Promise<SecurityRow | undefined>;
  list(symbols: readonly string[]): Promise<SecurityRow[]>;
  ensure(
    symbol: string,
    defaults: { currency: string; name?: string; type?: SecurityType; exchange?: string | null },
  ): Promise<SecurityRow>;
  search(query: string, limit?: number): Promise<SecurityRow[]>;
}

export interface PricesPort {
  latest(): Promise<
    {
      symbol: string;
      price: string;
      change: string | null;
      open: string | null;
      high: string | null;
      low: string | null;
      previousClose: string | null;
      asOf: IsoTimestamp;
    }[]
  >;
  quoteTimes(symbols: readonly string[]): Promise<{ symbol: string; fetchedAt: IsoTimestamp }[]>;
  dailyCloses(from?: IsoDate): Promise<{ symbol: string; date: IsoDate; close: string }[]>;
  symbolCloses(symbol: string, from: IsoDate): Promise<{ date: IsoDate; close: string }[]>;
  symbolBars(
    symbol: string,
    from: IsoDate,
  ): Promise<
    { date: IsoDate; open: string | null; high: string | null; low: string | null; close: string }[]
  >;
  coverage(symbols: readonly string[]): Promise<{ symbol: string; first: unknown; last: unknown }[]>;
  upsertLatest(rows: readonly Insertable<PriceLatestTable>[]): Promise<void>;
  upsertDaily(rows: readonly Insertable<PriceDailyTable>[]): Promise<void>;
}

export interface OptionQuotesPort {
  latest(): Promise<(QuoteRow & { previousClose: string | null; asOf: IsoTimestamp })[]>;
  daily(): Promise<(QuoteRow & { date: IsoDate })[]>;
  quoteTimes(contractIds: readonly Uuid[]): Promise<{ optionContractId: Uuid; fetchedAt: IsoTimestamp }[]>;
  upsertLatest(rows: readonly Omit<Insertable<OptionQuoteLatestTable>, 'ownerId'>[]): Promise<void>;
  upsertDaily(rows: readonly Omit<Insertable<OptionQuoteDailyTable>, 'ownerId'>[]): Promise<void>;
  addDaily(rows: readonly Omit<Insertable<OptionQuoteDailyTable>, 'ownerId'>[]): Promise<void>;
  manualMarks(): Promise<{ optionContractId: Uuid; mark: string; asOf: IsoDate }[]>;
  setManualMark(input: { optionContractId: Uuid; mark: string; asOf: IsoDate }): Promise<void>;
  clearManualMark(contractId: Uuid): Promise<void>;
}

export interface QuoteRow {
  optionContractId: Uuid;
  bid: string | null;
  ask: string | null;
  last: string | null;
  mark: string | null;
}

export interface FxPort {
  listRates(): Promise<FxRow[]>;
  upsertRates(rows: readonly FxRow[]): Promise<void>;
  coverage(base: string, quote: string): Promise<{ first: unknown; last: unknown } | undefined>;
}

export interface SnapshotsPort {
  listFrom(accountId: Uuid, from: IsoDate): Promise<SnapshotRow[]>;
  upsert(rows: readonly Insertable<PortfolioSnapshotsTable>[]): Promise<void>;
  invalidateFrom(accountId: Uuid, date: IsoDate): Promise<void>;
  invalidateAccount(accountId: Uuid): Promise<void>;
  invalidateUser(): Promise<void>;
}

export type SnapshotRow = {
  [K in keyof PortfolioSnapshotsTable]: PortfolioSnapshotsTable[K] extends { __select__: infer S }
    ? S
    : PortfolioSnapshotsTable[K];
};

export interface EncryptedKey {
  ciphertext: string;
  iv: string;
  authTag: string;
  hint: string;
}

export interface ProviderKeysPort {
  list(): Promise<ProviderKeyRow[]>;
  find(provider: StockDataProviderId, market: string): Promise<ProviderKeyRow | undefined>;
  save(provider: string, market: string, key: EncryptedKey): Promise<void>;
  setStatus(provider: string, market: string, status: 'VALID' | 'INVALID' | 'UNTESTED'): Promise<void>;
  delete(provider: string, market: string): Promise<void>;
  deleteMarket(market: string): Promise<void>;
}

export interface MarketsPort {
  list(): Promise<MarketRow[]>;
  save(row: Omit<MarketRow, 'userId' | 'createdAt' | 'updatedAt'>): Promise<void>;
  delete(code: string): Promise<void>;
}

export interface MarketProviderAssociation {
  market: MarketId;
  provider: string;
  priority: number;
  enabled: boolean;
}

export interface MarketProvidersPort {
  list(): Promise<MarketProviderAssociation[]>;
  replaceMarket(market: MarketId, rows: Omit<MarketProviderAssociation, 'market'>[]): Promise<void>;
  resetMarket(market: MarketId): Promise<void>;
}

export interface FeeSchedulesPort {
  find(id: Uuid | null): Promise<FeeScheduleRow | null | undefined>;
  saveForAccount(accountId: Uuid, input: FeeScheduleInput): Promise<FeeScheduleRow | null | undefined>;
  toSchedule(row: FeeScheduleRow | null | undefined): FeeSchedule;
}

export interface UsersPort {
  require(): Promise<UserRow>;
  updateSettings(patch: {
    baseCurrency?: string;
    averagePriceScope?: UserRow['averagePriceScope'];
    optionPremiumTreatment?: UserRow['optionPremiumTreatment'];
    autoExpireOtm?: 0 | 1;
    shortBuyHandling?: UserRow['shortBuyHandling'];
    borrowFeeTreatment?: UserRow['borrowFeeTreatment'];
    optionDataSource?: UserRow['optionDataSource'];
  }): Promise<void>;
}

export interface UsagePort {
  today(provider: StockDataProviderId, market: string): Promise<number>;
  remainingBudget(provider: StockDataProviderId, market: string): Promise<number>;
  hasDailyHeadroom(provider: StockDataProviderId, market: string): Promise<boolean>;
  record(provider: StockDataProviderId, market: string, calls: number): Promise<void>;
}

export interface StrategyGroupsPort {
  create(input: {
    kind: StrategyGroupKind;
    name?: string | null;
    strategyTag?: StrategyTag | null;
  }): Promise<StrategyGroupRow>;
  find(id: Uuid): Promise<StrategyGroupRow | undefined>;
}

export interface UserData {
  settings: Pick<
    UserRow,
    | 'baseCurrency'
    | 'averagePriceScope'
    | 'optionPremiumTreatment'
    | 'autoExpireOtm'
    | 'shortBuyHandling'
    | 'borrowFeeTreatment'
  >;
  currencies: Omit<CurrencyRow, 'userId'>[];
  feeSchedules: Omit<FeeScheduleRow, 'userId'>[];
  accounts: Omit<AccountRow, 'userId'>[];
  strategyGroups: Omit<StrategyGroupRow, 'userId'>[];
  transactions: TxnRow[];
  manualMarks: { optionContractId: Uuid; mark: string; asOf: IsoDate; updatedAt: IsoTimestamp }[];
  contractAdjustments: Omit<StoredAdjustmentRow, 'userId'>[];
}

export interface BackupPort {
  read(): Promise<UserData>;
  replace(data: UserData): Promise<void>;
}

export type SyncBase = Omit<SyncBaseTable, 'userId'>;

export interface ImportMappingsPort {
  find(fingerprint: string): Promise<string | undefined>;
  save(fingerprint: string, format: string, mapping: string): Promise<void>;
}

export interface DesktopPort {
  syncBase(): Promise<SyncBase | null>;
  setSyncBase(base: SyncBase | null): Promise<void>;
}

export interface StoreTx {
  accounts: AccountsPort;
  currencies: CurrenciesPort;
  transactions: TransactionsPort;
  contracts: OptionContractsPort;
  securities: SecuritiesPort;
  prices: PricesPort;
  optionQuotes: OptionQuotesPort;
  fx: FxPort;
  snapshots: SnapshotsPort;
  providerKeys: ProviderKeysPort;
  markets: MarketsPort;
  marketProviders: MarketProvidersPort;
  feeSchedules: FeeSchedulesPort;
  strategyGroups: StrategyGroupsPort;
  users: UsersPort;
  usage: UsagePort;
  backup: BackupPort;
  importMappings: ImportMappingsPort;
  desktop?: DesktopPort;
}

export interface Store {
  readonly name: string;
  ping(): Promise<void>;
  scope(principal: Principal): StoreTx;
  transaction<T>(principal: Principal, fn: (tx: StoreTx) => Promise<T>): Promise<T>;
}
