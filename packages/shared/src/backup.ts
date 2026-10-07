import { z } from 'zod';
import {
  ASSET_CLASSES,
  BORROW_FEE_TREATMENTS,
  AVERAGE_PRICE_SCOPES,
  FEE_SOURCES,
  OPTION_RIGHTS,
  OPTION_SETTLEMENTS,
  OPTION_STYLES,
  PREMIUM_TREATMENTS,
  SECURITY_TYPES,
  SHORT_BUY_HANDLINGS,
  STRATEGY_GROUP_KINDS,
  STRATEGY_TAGS,
  TRANSACTION_TYPES,
} from './enums.js';
import { currencyCode, decimalString, isoDate, uuid } from './schemas.js';

export const BACKUP_FORMAT = 'tickrs-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_MAX_BYTES = 50_000_000;

const nullableDecimal = decimalString.nullable();
const timestamp = z.string().datetime({ offset: true });
const flag = z.union([z.literal(0), z.literal(1)]);

const feeSchedule = z.object({
  id: uuid,
  name: z.string(),
  presetKey: z.string().nullable(),
  stockPerOrder: nullableDecimal,
  stockPerShare: nullableDecimal,
  stockMinPerOrder: nullableDecimal,
  stockMaxPerOrder: nullableDecimal,
  stockMaxPctOfValue: nullableDecimal,
  optionPerOrder: nullableDecimal,
  optionPerContract: nullableDecimal,
  optionMinPerOrder: nullableDecimal,
  optionMaxPerOrder: nullableDecimal,
  assignmentFee: nullableDecimal,
  exerciseFee: nullableDecimal,
  secFeeRate: nullableDecimal,
  tafPerShare: nullableDecimal,
  tafPerContract: nullableDecimal,
  tafMaxPerTrade: nullableDecimal,
  orfPerContract: nullableDecimal,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const account = z.object({
  id: uuid,
  name: z.string().min(1),
  broker: z.string().nullable(),
  currency: currencyCode,
  feeScheduleId: uuid.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const security = z.object({
  symbol: z.string().min(1),
  exchange: z.string().nullable(),
  name: z.string(),
  currency: currencyCode,
  type: z.enum(SECURITY_TYPES),
  sector: z.string().nullable(),
});

const optionContract = z.object({
  id: uuid,
  contractKey: z.string().min(1).optional(),
  occSymbol: z.string().min(1).optional(),
  underlyingSymbol: z.string().min(1),
  expiration: isoDate,
  strike: decimalString,
  optionRight: z.enum(OPTION_RIGHTS),
  multiplier: decimalString,
  style: z.enum(OPTION_STYLES),
  settlement: z.enum(OPTION_SETTLEMENTS),
});

const strategyGroup = z.object({
  id: uuid,
  kind: z.enum(STRATEGY_GROUP_KINDS),
  strategyTag: z.enum(STRATEGY_TAGS).nullable(),
  name: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const transaction = z.object({
  id: uuid,
  accountId: uuid,
  assetClass: z.enum(ASSET_CLASSES),
  symbol: z.string().min(1),
  optionContractId: uuid.nullable(),
  type: z.enum(TRANSACTION_TYPES),
  tradeDate: isoDate,
  quantity: nullableDecimal,
  price: nullableDecimal,
  fee: decimalString,
  amount: nullableDecimal,
  splitFrom: nullableDecimal,
  splitTo: nullableDecimal,
  currency: currencyCode,
  linkedTxnId: uuid.nullable(),
  isSystemGenerated: flag,
  isAutoExpired: flag.default(0),
  feeSource: z.enum(FEE_SOURCES),
  feeCommission: nullableDecimal,
  feeRegulatory: nullableDecimal,
  realizedBefore: nullableDecimal.default(null),
  strategyGroupId: uuid.nullable(),
  strategyTag: z.enum(STRATEGY_TAGS).nullable(),
  notes: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const manualMark = z.object({
  optionContractId: uuid,
  mark: decimalString,
  asOf: isoDate,
  updatedAt: timestamp,
});

const contractAdjustment = z.object({
  optionContractId: uuid,
  multiplier: nullableDecimal,
  deliverableShares: nullableDecimal,
  cashInLieu: nullableDecimal,
  strike: nullableDecimal,
  quoteSymbol: z.string().nullable(),
  displayName: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: timestamp,
  settings: z.object({
    baseCurrency: currencyCode,
    averagePriceScope: z.enum(AVERAGE_PRICE_SCOPES),
    optionPremiumTreatment: z.enum(PREMIUM_TREATMENTS),
    autoExpireOtm: z.boolean(),
    shortBuyHandling: z.enum(SHORT_BUY_HANDLINGS).default('BLOCK'),
    borrowFeeTreatment: z.enum(BORROW_FEE_TREATMENTS).default('REALIZED'),
  }),
  currencies: z.array(z.object({ code: currencyCode, name: z.string() })),
  feeSchedules: z.array(feeSchedule),
  accounts: z.array(account),
  securities: z.array(security),
  optionContracts: z.array(optionContract),
  strategyGroups: z.array(strategyGroup),
  transactions: z.array(transaction),
  manualMarks: z.array(manualMark),
  contractAdjustments: z.array(contractAdjustment),
});
export type BackupFile = z.infer<typeof backupSchema>;

export interface BackupCounts {
  accounts: number;
  transactions: number;
  feeSchedules: number;
  strategyGroups: number;
  manualMarks: number;
  contractAdjustments: number;
}

export function backupCounts(data: {
  accounts: readonly unknown[];
  transactions: readonly unknown[];
  feeSchedules: readonly unknown[];
  strategyGroups: readonly unknown[];
  manualMarks: readonly unknown[];
  contractAdjustments: readonly unknown[];
}): BackupCounts {
  return {
    accounts: data.accounts.length,
    transactions: data.transactions.length,
    feeSchedules: data.feeSchedules.length,
    strategyGroups: data.strategyGroups.length,
    manualMarks: data.manualMarks.length,
    contractAdjustments: data.contractAdjustments.length,
  };
}
