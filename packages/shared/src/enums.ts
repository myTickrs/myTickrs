export const ASSET_CLASSES = ['STOCK', 'OPTION'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const STOCK_TRANSACTION_TYPES = [
  'BUY',
  'SELL',
  'DIV_CASH',
  'DIV_REINVEST',
  'SPLIT',
  'SELL_SHORT',
  'BUY_TO_COVER',
  'DIV_PAID',
  'BORROW_FEE',
] as const;
export const OPTION_TRANSACTION_TYPES = ['BTO', 'STO', 'BTC', 'STC', 'EXP', 'ASN', 'EXR'] as const;
export type StockTransactionType = (typeof STOCK_TRANSACTION_TYPES)[number];
export type OptionTransactionType = (typeof OPTION_TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPES = [...STOCK_TRANSACTION_TYPES, ...OPTION_TRANSACTION_TYPES] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const STOCK_TRADE_TYPES = [
  'BUY',
  'SELL',
  'SELL_SHORT',
  'BUY_TO_COVER',
] as const satisfies readonly StockTransactionType[];
export type StockTradeType = (typeof STOCK_TRADE_TYPES)[number];

export const OPTION_TRADE_TYPES = [
  'BTO',
  'STO',
  'BTC',
  'STC',
] as const satisfies readonly OptionTransactionType[];
export type OptionTradeType = (typeof OPTION_TRADE_TYPES)[number];

export const OPTION_OPENING_TYPES = ['BTO', 'STO'] as const satisfies readonly OptionTransactionType[];

export const OPTION_LIFECYCLE_TYPES = [
  'EXP',
  'ASN',
  'EXR',
] as const satisfies readonly OptionTransactionType[];

export const ASSIGNMENT_EXERCISE_TYPES = ['ASN', 'EXR'] as const satisfies readonly OptionTransactionType[];
export type AssignmentExerciseType = (typeof ASSIGNMENT_EXERCISE_TYPES)[number];

export const CASH_AMOUNT_TYPES = [
  'DIV_CASH',
  'DIV_PAID',
  'BORROW_FEE',
] as const satisfies readonly StockTransactionType[];

export const PRICED_TYPES = [
  ...STOCK_TRADE_TYPES,
  'DIV_REINVEST',
  ...OPTION_TRADE_TYPES,
] as const satisfies readonly TransactionType[];

export const FEE_CHARGED_TYPES = [
  ...STOCK_TRADE_TYPES,
  ...OPTION_TRADE_TYPES,
  ...ASSIGNMENT_EXERCISE_TYPES,
] as const satisfies readonly TransactionType[];
export type FeeChargedType = (typeof FEE_CHARGED_TYPES)[number];

const isIn = (types: readonly string[], type: string): boolean => types.includes(type);
export const isStockTrade = (type: string): boolean => isIn(STOCK_TRADE_TYPES, type);
export const isOptionTrade = (type: string): boolean => isIn(OPTION_TRADE_TYPES, type);
export const isOptionOpening = (type: string): boolean => isIn(OPTION_OPENING_TYPES, type);
export const isOptionLifecycle = (type: string): boolean => isIn(OPTION_LIFECYCLE_TYPES, type);
export const isAssignmentOrExercise = (type: string): boolean => isIn(ASSIGNMENT_EXERCISE_TYPES, type);
export const isCashAmount = (type: string): boolean => isIn(CASH_AMOUNT_TYPES, type);
export const isPriced = (type: string): boolean => isIn(PRICED_TYPES, type);
export const isFeeCharged = (type: string): type is FeeChargedType => isIn(FEE_CHARGED_TYPES, type);

export const OPENING_TRADE_TYPES = [
  'BUY',
  'SELL_SHORT',
  'BTO',
  'STO',
] as const satisfies readonly TransactionType[];
export const isOpeningTrade = (type: string): boolean => isIn(OPENING_TRADE_TYPES, type);

export const TRANSACTION_TYPES_BY_ASSET_CLASS = {
  STOCK: STOCK_TRANSACTION_TYPES,
  OPTION: OPTION_TRANSACTION_TYPES,
} as const satisfies Record<AssetClass, readonly TransactionType[]>;

export const SECURITY_TYPES = ['STOCK', 'ETF', 'INDEX'] as const;
export type SecurityType = (typeof SECURITY_TYPES)[number];

export const OPTION_RIGHTS = ['CALL', 'PUT'] as const;
export type OptionRight = (typeof OPTION_RIGHTS)[number];

export const OPTION_STYLES = ['AMERICAN', 'EUROPEAN'] as const;
export type OptionStyle = (typeof OPTION_STYLES)[number];

export const OPTION_SETTLEMENTS = ['PHYSICAL', 'CASH'] as const;
export type OptionSettlement = (typeof OPTION_SETTLEMENTS)[number];

export const AVERAGE_PRICE_SCOPES = ['LIFETIME', 'CURRENT'] as const;
export type AveragePriceScope = (typeof AVERAGE_PRICE_SCOPES)[number];

export const PREMIUM_TREATMENTS = ['ROLL_INTO_STOCK', 'SEPARATE'] as const;
export type PremiumTreatment = (typeof PREMIUM_TREATMENTS)[number];

export const SHORT_BUY_HANDLINGS = ['BLOCK', 'COVER'] as const;
export type ShortBuyHandling = (typeof SHORT_BUY_HANDLINGS)[number];

export const BORROW_FEE_TREATMENTS = ['REALIZED', 'SEPARATE'] as const;
export type BorrowFeeTreatment = (typeof BORROW_FEE_TREATMENTS)[number];

export const STRATEGY_GROUP_KINDS = ['MULTI_LEG', 'ROLL_CHAIN', 'WHEEL', 'CUSTOM'] as const;
export type StrategyGroupKind = (typeof STRATEGY_GROUP_KINDS)[number];

export const STRATEGY_TAGS = [
  'COVERED_CALL',
  'CSP',
  'WHEEL',
  'VERTICAL',
  'IRON_CONDOR',
  'STRADDLE',
  'STRANGLE',
  'CALENDAR',
  'LONG_CALL',
  'LONG_PUT',
  'OTHER',
] as const;
export type StrategyTag = (typeof STRATEGY_TAGS)[number];

export const CORPORATE_ACTION_TYPES = ['SPLIT', 'DIVIDEND'] as const;
export type CorporateActionType = (typeof CORPORATE_ACTION_TYPES)[number];

export const PROVIDER_KEY_STATUSES = ['VALID', 'INVALID', 'UNTESTED'] as const;
export type ProviderKeyStatus = (typeof PROVIDER_KEY_STATUSES)[number];

export type StockDataProviderId = string;
export const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

export const NO_MARKET_PROVIDERS = '_none';

export type MarketId = string;

export const CHART_RANGES = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'ALL'] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

export const MARKET_PROVIDER_PRIORITY_MIN = 1;
export const MARKET_PROVIDER_PRIORITY_MAX = 2_147_483_647;

export const OPTION_DATA_SOURCES = ['none', 'polygon', 'tradier'] as const;
export type OptionDataSource = (typeof OPTION_DATA_SOURCES)[number];

export const FEE_SOURCES = ['AUTO', 'MANUAL', 'IMPORTED'] as const;
export type FeeSource = (typeof FEE_SOURCES)[number];

export const DEFAULT_CURRENCIES = ['USD', 'CAD'] as const;
