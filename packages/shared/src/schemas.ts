import { z } from 'zod';
import {
  BORROW_FEE_TREATMENTS,
  AVERAGE_PRICE_SCOPES,
  MARKET_PROVIDER_PRIORITY_MAX,
  MARKET_PROVIDER_PRIORITY_MIN,
  OPTION_DATA_SOURCES,
  OPTION_RIGHTS,
  OPTION_SETTLEMENTS,
  OPTION_STYLES,
  PREMIUM_TREATMENTS,
  PROVIDER_ID_PATTERN,
  SHORT_BUY_HANDLINGS,
} from './enums.js';

const DECIMAL = /^-?\d+(\.\d+)?$/;
const hasDigit = (s: string) => /[1-9]/.test(s);

export const decimalString = z.string().regex(DECIMAL, 'Enter a number');
export const nonNegativeDecimal = decimalString.refine((v) => !v.startsWith('-'), 'Cannot be negative');
export const positiveDecimal = nonNegativeDecimal.refine(hasDigit, 'Must be greater than zero');
export const positiveInteger = z
  .string()
  .regex(/^\d+$/, 'Enter a whole number')
  .refine(hasDigit, 'Must be greater than zero');

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, 'Not a real date');

export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Use a three-letter currency code, e.g. EUR');
export const symbolCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\^?[A-Z0-9][A-Z0-9.-]{0,11}$/, 'Not a valid ticker');
export const uuid = z.string().uuid();

export const contractSizeTerms = {
  multiplier: positiveDecimal.optional(),
  style: z.enum(OPTION_STYLES).optional(),
  settlement: z.enum(OPTION_SETTLEMENTS).optional(),
};

export const contractTerms = z.object({
  underlying: symbolCode,
  expiration: isoDate,
  strike: positiveDecimal,
  right: z.enum(OPTION_RIGHTS),
  ...contractSizeTerms,
});
export type ContractTermsInput = z.infer<typeof contractTerms>;

export const optionContractRef = z.union([
  z.object({ optionContractId: uuid }),
  z.object({ occSymbol: z.string().trim().min(6), ...contractSizeTerms }),
  z.object({ contract: contractTerms }),
]);

const tradeBase = {
  accountId: uuid,
  tradeDate: isoDate,
  fee: nonNegativeDecimal.optional(),
  notes: z.string().max(2000).optional(),
};

const stockTrade = z.object({
  ...tradeBase,
  assetClass: z.literal('STOCK'),
  type: z.enum(['BUY', 'SELL', 'SELL_SHORT', 'BUY_TO_COVER']),
  symbol: symbolCode,
  currency: currencyCode.optional(),
  quantity: positiveDecimal,
  price: nonNegativeDecimal,
  realizedBefore: decimalString.optional(),
});

const dividendCash = z.object({
  ...tradeBase,
  assetClass: z.literal('STOCK'),
  type: z.literal('DIV_CASH'),
  symbol: symbolCode,
  currency: currencyCode.optional(),
  amount: positiveDecimal,
});

const dividendPaid = z.object({
  ...tradeBase,
  assetClass: z.literal('STOCK'),
  type: z.literal('DIV_PAID'),
  symbol: symbolCode,
  currency: currencyCode.optional(),
  amount: positiveDecimal,
});

const borrowFee = z.object({
  accountId: uuid,
  tradeDate: isoDate,
  notes: z.string().max(2000).optional(),
  assetClass: z.literal('STOCK'),
  type: z.literal('BORROW_FEE'),
  symbol: symbolCode,
  currency: currencyCode.optional(),
  amount: positiveDecimal,
});

const dividendReinvested = z.object({
  ...tradeBase,
  assetClass: z.literal('STOCK'),
  type: z.literal('DIV_REINVEST'),
  symbol: symbolCode,
  currency: currencyCode.optional(),
  quantity: positiveDecimal,
  price: nonNegativeDecimal,
});

const stockSplit = z.object({
  accountId: uuid,
  tradeDate: isoDate,
  notes: z.string().max(2000).optional(),
  assetClass: z.literal('STOCK'),
  type: z.literal('SPLIT'),
  symbol: symbolCode,
  splitFrom: positiveDecimal,
  splitTo: positiveDecimal,
});

const optionTrade = z
  .object({
    ...tradeBase,
    assetClass: z.literal('OPTION'),
    type: z.enum(['BTO', 'STO', 'BTC', 'STC']),
    quantity: positiveInteger,
    price: nonNegativeDecimal,
    realizedBefore: decimalString.optional(),
  })
  .and(optionContractRef);

const optionExpire = z
  .object({
    accountId: uuid,
    tradeDate: isoDate,
    fee: nonNegativeDecimal.optional(),
    notes: z.string().max(2000).optional(),
    assetClass: z.literal('OPTION'),
    type: z.literal('EXP'),
    quantity: positiveInteger.optional(),
  })
  .and(optionContractRef);

const optionLifecycle = z
  .object({
    accountId: uuid,
    tradeDate: isoDate,
    fee: nonNegativeDecimal.optional(),
    notes: z.string().max(2000).optional(),
    assetClass: z.literal('OPTION'),
    type: z.enum(['ASN', 'EXR']),
    quantity: positiveInteger,
    price: nonNegativeDecimal.optional(),
    confirmNegativeStock: z.boolean().optional(),
  })
  .and(optionContractRef);

export const createTransactionSchema = z.union([
  stockTrade,
  dividendCash,
  dividendPaid,
  borrowFee,
  dividendReinvested,
  stockSplit,
  optionTrade,
  optionExpire,
  optionLifecycle,
]);
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const EDITABLE_TYPE_FAMILIES: readonly (readonly string[])[] = [
  ['BTO', 'STO', 'BTC', 'STC'],
  ['BUY', 'SELL', 'DIV_REINVEST', 'SELL_SHORT', 'BUY_TO_COVER'],
  ['DIV_CASH', 'DIV_PAID'],
];

export const updateTransactionSchema = z
  .object({
    accountId: uuid,
    type: z.string(),
    symbol: symbolCode,
    contract: contractTerms,
    tradeDate: isoDate,
    quantity: positiveDecimal,
    price: nonNegativeDecimal,
    amount: decimalString,
    fee: nonNegativeDecimal,
    realizedBefore: decimalString.nullable(),
    splitFrom: positiveDecimal,
    splitTo: positiveDecimal,
    notes: z.string().max(2000).nullable(),
    confirmNegativeStock: z.boolean(),
  })
  .partial();
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export const transactionQuerySchema = z.object({
  accountId: uuid.optional(),
  assetClass: z.enum(['STOCK', 'OPTION']).optional(),
  symbol: symbolCode.optional(),
  type: z.string().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(['tradeDate', 'type', 'symbol', 'quantity', 'price', 'fee']).default('tradeDate'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

export const accountSchema = z.object({
  name: z.string().trim().min(1).max(100),
  broker: z.string().trim().max(100).nullable().optional(),
  currency: currencyCode.default('USD'),
  feeScheduleId: uuid.nullable().optional(),
});
export type AccountInput = z.infer<typeof accountSchema>;
export const accountPatchSchema = accountSchema.extend({ currency: currencyCode }).partial();
export const accountBatchSchema = z.object({
  items: z
    .array(accountSchema)
    .min(1)
    .max(20)
    .refine(
      (items) => new Set(items.map((a) => a.name.toLowerCase())).size === items.length,
      'Each account needs a different name',
    ),
});

const feeField = nonNegativeDecimal.nullable().optional();
export const feeScheduleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  presetKey: z.string().max(40).nullable().optional(),
  stockPerOrder: feeField,
  stockPerShare: feeField,
  stockMinPerOrder: feeField,
  stockMaxPerOrder: feeField,
  stockMaxPctOfValue: feeField,
  optionPerOrder: feeField,
  optionPerContract: feeField,
  optionMinPerOrder: feeField,
  optionMaxPerOrder: feeField,
  assignmentFee: feeField,
  exerciseFee: feeField,
  secFeeRate: feeField,
  tafPerShare: feeField,
  tafPerContract: feeField,
  tafMaxPerTrade: feeField,
  orfPerContract: feeField,
});
export type FeeScheduleInput = z.infer<typeof feeScheduleSchema>;

export const feeQuoteSchema = z
  .object({
    accountId: uuid,
    type: z.enum(['BUY', 'SELL', 'SELL_SHORT', 'BUY_TO_COVER', 'BTO', 'STO', 'BTC', 'STC', 'ASN', 'EXR']),
    quantity: positiveDecimal,
    price: nonNegativeDecimal.default('0'),
    optionContractId: uuid.optional(),
  })
  .strict();
export type FeeQuoteInput = z.infer<typeof feeQuoteSchema>;

export const currencySchema = z.object({
  code: currencyCode,
  name: z.string().trim().min(1).max(60).optional(),
});
export type CurrencyInput = z.infer<typeof currencySchema>;

export const settingsSchema = z
  .object({
    baseCurrency: currencyCode,
    averagePriceScope: z.enum(AVERAGE_PRICE_SCOPES),
    optionPremiumTreatment: z.enum(PREMIUM_TREATMENTS),
    autoExpireOtm: z.boolean(),
    shortBuyHandling: z.enum(SHORT_BUY_HANDLINGS),
    borrowFeeTreatment: z.enum(BORROW_FEE_TREATMENTS),
  })
  .partial();
export type SettingsInput = z.infer<typeof settingsSchema>;

export const manualMarkSchema = z.object({
  mark: nonNegativeDecimal,
  asOf: isoDate.optional(),
});

export const contractTermsSchema = z.object({
  multiplier: positiveDecimal.nullable().optional(),
  deliverableShares: positiveDecimal.nullable().optional(),
  cashInLieu: nonNegativeDecimal.nullable().optional(),
  strike: positiveDecimal.nullable().optional(),
  quoteSymbol: z.string().trim().max(32).nullable().optional(),
  displayName: z.string().trim().max(120).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  confirmNegativeStock: z.boolean().optional(),
});
export type ContractTermsSchemaInput = z.infer<typeof contractTermsSchema>;

export const rollOptionSchema = z.object({
  optionContractId: uuid,
  accountId: uuid.optional(),
  tradeDate: isoDate,
  quantity: positiveInteger,
  close: z.object({ price: nonNegativeDecimal, fee: nonNegativeDecimal.optional() }),
  open: z.object({
    expiration: isoDate,
    strike: positiveDecimal,
    price: nonNegativeDecimal,
    quantity: positiveInteger.optional(),
    fee: nonNegativeDecimal.optional(),
  }),
  notes: z.string().max(2000).optional(),
  dryRun: z.boolean().optional(),
});
export type RollOptionInput = z.infer<typeof rollOptionSchema>;

export const resolveNeedsActionSchema = z.object({
  items: z
    .array(
      z.object({
        contractId: uuid,
        accountId: uuid,
        outcome: z.enum(['EXP', 'ASN', 'EXR']),
        quantity: positiveInteger.optional(),
        price: nonNegativeDecimal.optional(),
        fee: nonNegativeDecimal.optional(),
        confirmNegativeStock: z.boolean().optional(),
      }),
    )
    .min(1),
});

export const providerKeySchema = z.object({ apiKey: z.string().trim().min(8).max(200) });
export const providerIdSchema = z.string().regex(PROVIDER_ID_PATTERN, 'Not a provider id');

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:MM');

export const marketCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,7}$/, 'Use 2 to 8 letters or digits, e.g. HK');

export const marketSuffixSchema = z.object({
  suffix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,4}$/, 'Use 1 to 4 letters or digits'),
  exchange: z.string().trim().min(1).max(20),
  mic: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4}$/, 'Use the four-character MIC')
    .nullable()
    .default(null),
});

export const marketSchema = z
  .object({
    code: marketCode,
    name: z.string().trim().min(1).max(60),
    timezone: z.string().trim().min(1).max(60),
    sessions: z
      .array(z.object({ open: clockTime, close: clockTime }))
      .min(1)
      .max(4)
      .refine((all) => all.every((s) => s.open < s.close), 'A session must open before it closes'),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'Use a two-letter country code')
      .nullable()
      .default(null),
    closedDays: z.array(isoDate).max(1000).default([]),
    holidaysThrough: z.number().int().min(2000).max(2100).nullable().default(null),
    currency: currencyCode,
    suffixes: z.array(marketSuffixSchema).max(10).default([]),
    testSymbol: symbolCode,
  })
  .refine(
    (m) => new Set(m.suffixes.map((s) => s.suffix)).size === m.suffixes.length,
    'A suffix may appear only once',
  );
export type MarketInput = z.input<typeof marketSchema>;
export type MarketDef = z.infer<typeof marketSchema>;

export const marketProvidersSchema = z.object({
  rows: z
    .array(
      z.object({
        provider: providerIdSchema,
        priority: z
          .number()
          .int('Use a whole number')
          .min(MARKET_PROVIDER_PRIORITY_MIN, 'Use a number of 1 or more')
          .max(MARKET_PROVIDER_PRIORITY_MAX),
        enabled: z.boolean(),
      }),
    )
    .max(20)
    .refine((rows) => new Set(rows.map((r) => r.provider)).size === rows.length, {
      message: 'A provider can appear only once per market',
    }),
});
export type MarketProvidersInput = z.infer<typeof marketProvidersSchema>;
export const optionDataSourceSchema = z.object({ source: z.enum(OPTION_DATA_SOURCES) });
