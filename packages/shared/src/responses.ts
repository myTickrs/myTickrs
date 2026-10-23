import type {
  AssetClass,
  AveragePriceScope,
  BorrowFeeTreatment,
  ChartRange,
  FeeSource,
  OptionDataSource,
  OptionRight,
  OptionSettlement,
  OptionStyle,
  PremiumTreatment,
  ProviderKeyStatus,
  SecurityType,
  ShortBuyHandling,
  TransactionType,
} from './enums.js';
import type { MarketDef } from './schemas.js';

export type PositionSide = 'LONG' | 'SHORT';
export type Moneyness = 'ITM' | 'ATM' | 'OTM';

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DayChange {
  amount: string;
  percent: string | null;
}

export interface UserSettings {
  baseCurrency: string;
  averagePriceScope: AveragePriceScope;
  optionPremiumTreatment: PremiumTreatment;
  autoExpireOtm: boolean;
  shortBuyHandling: ShortBuyHandling;
  borrowFeeTreatment: BorrowFeeTreatment;
  optionDataSource: OptionDataSource;
}

export interface TransactionDto {
  id: string;
  accountId: string;
  assetClass: AssetClass;
  type: TransactionType;
  tradeDate: string;
  symbol: string;
  currency: string;
  quantity: string | null;
  price: string | null;
  fee: string;
  feeSource: FeeSource;
  feeCommission: string | null;
  feeRegulatory: string | null;
  realizedBefore: string | null;
  amount: string | null;
  splitFrom: string | null;
  splitTo: string | null;
  linkedTxnId: string | null;
  isSystemGenerated: boolean;
  strategyGroupId: string | null;
  notes: string | null;
  cashEffect: string | null;
  optionContract: {
    id: string;
    underlying: string;
    expiration: string;
    strike: string;
    issuedStrike: string;
    right: OptionRight;
    multiplier: string;
    deliverableShares: string;
    isAdjusted: boolean;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockPositionValue {
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

export interface OptionPositionValue {
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

export interface HoldingsResponse {
  baseCurrency: string;
  marketValue: string;
  stocks: (StockPositionValue & { weight: string; dayChange: DayChange; totalPl: DayChange })[];
  options: (OptionPositionValue & {
    description: string;
    expiration: string | null;
    strike: string | null;
    right: OptionRight | null;
    weight: string;
    dayChange: DayChange;
    totalPl: DayChange;
  })[];
  closedStocks: {
    symbol: string;
    currency: string;
    realized: string;
    dividends: string;
    shortCosts: string;
    totalPl: DayChange;
    fxRate: string;
  }[];
  hasEstimatedValues: boolean;
}

export interface AccountHolding {
  accountId: string;
  accountName: string;
  currency: string;
  marketValue: string;
  positionsValue: string;
  positionCount: number;
  closedCount: number;
  weight: string;
  realized: string;
  unrealized: string;
  totalPl: string;
}

export interface HoldingsByAccountResponse {
  baseCurrency: string;
  marketValue: string;
  accounts: AccountHolding[];
  hasEstimatedValues: boolean;
}

export interface PortfolioSummary {
  baseCurrency: string;
  asOf: string;
  marketValue: string;
  positionsValue: string;
  stocksValue: string;
  optionsValue: string;
  netContributions: string;
  totals: {
    unrealizedStock: string;
    unrealizedOption: string;
    realizedStock: string;
    realizedOption: string;
    dividends: string;
    shortCosts: string;
    componentsTotal: string;
    totalReturn: string;
  };
  totalReturn: { allTime: string; year: string };
  optionPnl: { allTime: string; year: string; month: string; open: string };
  dayChange: DayChange;
  counts: { accounts: number; stocks: number; options: number; needsAction: number; expiringSoon: number };
  hasEstimatedValues: boolean;
}

export interface OptionPosition extends OptionPositionValue {
  description: string;
  accounts: { id: string; name: string }[];
  dayChange: DayChange;
  expiration: string;
  strike: string;
  right: OptionRight;
  multiplier: string;
  style: OptionStyle;
  settlement: OptionSettlement;
  isAdjusted: boolean;
  daysToExpiration: number;
  needsAction: boolean;
  moneyness: Moneyness | null;
  underlyingPrice: string | null;
  breakEven: string;
  coverage: 'COVERED' | 'PARTIAL' | 'NAKED' | null;
  returnOnRisk: string | null;
  annualizedReturnOnRisk: string | null;
  rollChain: { strategyGroupId: string; rolls: number; netPremium: string } | null;
}

export interface OptionPositionsResponse {
  baseCurrency: string;
  asOf: string;
  items: OptionPosition[];
}

export interface NeedsActionItem {
  contractId: string;
  description: string;
  underlying: string;
  expiration: string;
  side: PositionSide;
  contracts: string;
  accountId: string | null;
  underlyingClose: string | null;
  settlement: OptionSettlement;
  suggestedOutcome: 'EXP' | 'ASN' | 'EXR' | null;
  moneyness: Moneyness | null;
}

export interface NeedsActionResponse {
  asOf: string;
  items: NeedsActionItem[];
}

export interface RollResponse {
  dryRun: false;
  strategyGroupId: string;
  accountId: string;
  netPremium: string;
  transactions: TransactionDto[];
}

export interface ManualMarkResponse {
  contractId: string;
  mark: string;
  asOf: string;
}

export type FeeScheduleResponse = Record<string, string | null> | null;

export type OptionOutcome = 'CLOSED' | 'ROLLED' | 'EXPIRED' | 'ASSIGNED' | 'EXERCISED';

export interface OptionHistoryItem {
  txnId: string;
  date: string;
  closeType: TransactionType;
  outcome: OptionOutcome;
  contractId: string;
  contract: string;
  underlying: string;
  expiration: string;
  strike: string;
  right: OptionRight;
  side: PositionSide | null;
  contracts: string | null;
  account: { id: string; name: string } | null;
  currency: string;
  amount: string;
  rolledIntoStock: boolean;
  transactions: TransactionDto[];
}

export interface OptionHistoryResponse {
  baseCurrency: string;
  items: OptionHistoryItem[];
}

export interface OptionIncome {
  baseCurrency: string;
  months: { month: string; realized: string; closed: number; winRate: string | null }[];
  byUnderlying: Record<string, { realized: string; currency: string }>;
  openPremium: string;
  contracts: number;
}

export type KnownTermsSource = 'CONTRACT' | 'UNDERLYING' | 'MARKET';

export interface KnownContractTerms {
  underlying: string;
  multiplier: string | null;
  style: OptionStyle | null;
  settlement: OptionSettlement | null;
  source: KnownTermsSource | null;
}

export interface AccountDto {
  id: string;
  userId: string;
  name: string;
  broker: string | null;
  currency: string;
  feeScheduleId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CurrencyItem {
  code: string;
  name: string;
  isBase: boolean;
  accounts: number;
  transactions: number;
  rateToBase: string | null;
}

export interface CurrencyList {
  baseCurrency: string;
  items: CurrencyItem[];
}

export interface FeeQuote {
  commission: string;
  secFee: string;
  taf: string;
  orf: string;
  total: string;
  feeSource: 'AUTO';
  scheduleName?: string;
}

export interface SecurityMatch {
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string;
  type: SecurityType;
  market: string | null;
}

export interface SecuritySearchResponse {
  source: string;
  items: SecurityMatch[];
}

export interface MarketItem extends MarketDef {
  isHome: boolean;
  openNow: boolean;
  symbols: number;
}

export interface MarketsResponse {
  items: MarketItem[];
}

export interface ProviderCapabilities {
  search: boolean;
  quotes: boolean;
  history: boolean;
  corporateActions: boolean;
  optionQuotes?: boolean;
}

export interface ProviderSetting {
  provider: string;
  installed: boolean;
  name: string;
  version: string | null;
  description: ({ en: string } & Partial<Record<string, string>>) | null;
  signupUrl: string | null;
  auth: 'apiKey' | 'none';
  capabilities: ProviderCapabilities | null;
  limitPerDay: number | null;
  limitPerMinute: number | null;
}

export interface ProviderKey {
  provider: string;
  market: string;
  keyHint: string;
  status: ProviderKeyStatus;
  lastVerifiedAt: string | null;
  usedToday: number;
}

export interface MarketInfo {
  id: string;
  name: string;
  currency: string;
  suffixes: MarketDef['suffixes'];
}

export interface MarketProviderRow {
  market: string;
  provider: string;
  priority: number;
  enabled: boolean;
}

export interface ProvidersResponse {
  items: ProviderSetting[];
  keys: ProviderKey[];
  markets: MarketInfo[];
  associations: {
    defaults: readonly MarketProviderRow[];
    user: readonly MarketProviderRow[];
    base?: string | null;
  };
  baseProvider: string | null;
  registryVersion: number;
  pluginsDir: string | null;
  loadErrors: { folder: string; id: string | null; error: string }[];
  optionDataSource: OptionDataSource;
  optionDataSources: {
    id: OptionDataSource;
    available: boolean;
    capabilities: { chain: boolean; quotes: boolean; history: boolean; greeks: boolean };
  }[];
}

export interface PerformancePoint {
  date: string;
  positionsValue: string;
  marketValue: string;
  netContributions: string;
  externalFlow: string;
  dailyReturn: string | null;
  twrIndex: string;
  estimated: boolean;
  undefinedReturn: boolean;
}

export interface PerformanceResponse {
  baseCurrency: string;
  range: ChartRange;
  from: string;
  to: string;
  points: PerformancePoint[];
  benchmark: { symbol: string; points: { date: string; return: string }[] } | null;
  pendingSymbols: string[];
  cached: boolean;
}

export interface ChartMarker {
  transactionId: string;
  date: string;
  kind: 'BUY' | 'SELL' | 'OPTION';
  type: string;
  label: string;
  price: string | null;
  quantity: string | null;
  value: string | null;
  currency: string;
  isSystemGenerated: boolean;
  accountId: string;
  accountName: string;
}

export interface StrikeLine {
  contractId: string;
  price: string;
  label: string;
  expiration: string;
  side: PositionSide;
}

export interface StockQuote {
  price: string;
  date: string;
  previousClose: string | null;
  change: string | null;
  changePct: string | null;
  open: string | null;
  high: string | null;
  low: string | null;
  estimated: boolean;
}

export interface StockPnlSplit {
  total: string;
  stock: string;
  option: string;
}

export interface StockChartResponse {
  symbol: string;
  name: string;
  currency: string;
  range: ChartRange;
  from: string;
  to: string;
  bars: { date: string; open: string | null; high: string | null; low: string | null; close: string }[];
  markers: ChartMarker[];
  strikes: StrikeLine[];
  quote: StockQuote | null;
  position: {
    shares: string;
    side: PositionSide | null;
    averagePrice: string | null;
    realized: StockPnlSplit;
    unrealized: StockPnlSplit;
    shortCosts: string;
    dayChange: { total: string; stock: string | null; option: string | null } | null;
  } | null;
  pendingHistory: boolean;
}
