import { z } from 'zod';
import { OPTION_RIGHTS } from './enums.js';
import { currencyCode, isoDate, uuid } from './schemas.js';
import { SIGN_IN_PROVIDERS } from './sync.js';

export const IMPORT_FILE_KINDS = ['image', 'csv', 'json', 'xml'] as const;
export type ImportFileKind = (typeof IMPORT_FILE_KINDS)[number];

export const AI_FILE_KINDS = ['image'] as const;
export type AiFileKind = (typeof AI_FILE_KINDS)[number];
export const STRUCTURED_FILE_KINDS = ['csv', 'json', 'xml'] as const;
export type StructuredFileKind = (typeof STRUCTURED_FILE_KINDS)[number];

export const IMPORT_FILES_AT_A_TIME = 1;
export const IMPORT_AI_FILES = 10;
export const IMPORT_MAX_IMAGE_BYTES = 4_000_000;
export const IMPORT_MAX_STRUCTURED_BYTES = 5_000_000;
export const IMPORT_MAX_ROWS = 20_000;
export const IMPORT_SAMPLE_ROWS = 20;
export const IMPORT_AI_MAX_RECORDS = 1000;
export const IMPORT_DEFAULT_MAX_LONG_EDGE = 1568;

export const IMPORT_MEDIA_TYPE = 'application/vnd.tickrs.import+json';
export const IMPORT_MAX_REQUEST_BYTES = 30_000_000;

const KIND_BY_EXTENSION: Record<string, ImportFileKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  csv: 'csv',
  json: 'json',
  xml: 'xml',
  ofx: 'xml',
  qfx: 'xml',
};
const KIND_BY_MEDIA_TYPE: Record<string, ImportFileKind> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
};

export function importFileKind(name: string, mediaType = ''): ImportFileKind | null {
  const dot = name.lastIndexOf('.');
  if (dot > 0) return KIND_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? null;
  return KIND_BY_MEDIA_TYPE[mediaType.toLowerCase().split(';')[0]!.trim()] ?? null;
}

export const importFileSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mediaType: z.string().max(100).default(''),
  data: z.string().min(1),
});
export type ImportFile = z.infer<typeof importFileSchema>;

const text = z.string().max(500);
const nullableText = text.nullable();

export const instrumentSchema = z.object({
  symbol: nullableText,
  occSymbol: nullableText,
  underlying: nullableText,
  expiration: nullableText,
  strike: nullableText,
  right: z.enum(OPTION_RIGHTS).nullable(),
});
export type ExtractedInstrument = z.infer<typeof instrumentSchema>;

export const EXTRACT_DOCUMENT_TYPES = ['positions', 'unknown'] as const;
export type ExtractDocumentType = (typeof EXTRACT_DOCUMENT_TYPES)[number];

const confidence = z.enum(['high', 'low']);

export const extractedPositionSchema = z.object({
  instrument: instrumentSchema,
  quantity: text,
  averagePrice: nullableText,
  marketValue: nullableText,
  unrealizedPnl: nullableText,
  realizedPnl: nullableText,
  confidence,
  note: nullableText,
  record: z.number().int().positive().nullable(),
});
export type ExtractedPosition = z.infer<typeof extractedPositionSchema>;

export const extractResultSchema = z.object({
  documentType: z.enum(EXTRACT_DOCUMENT_TYPES),
  currency: nullableText,
  positions: z.array(extractedPositionSchema).max(2000),
  totals: z.object({ realizedPnl: nullableText, unrealizedPnl: nullableText }),
  skippedRecords: z.array(z.number().int().positive()).max(IMPORT_AI_MAX_RECORDS),
  warnings: z.array(text).max(50),
});
export type ExtractResult = z.infer<typeof extractResultSchema>;

export const MAPPING_FIELDS = [
  'symbol',
  'quantity',
  'averagePrice',
  'costBasis',
  'marketValue',
  'unrealizedPnl',
  'realizedPnl',
  'currency',
  'description',
  'occSymbol',
  'underlying',
  'expiration',
  'strike',
  'right',
] as const;
export type MappingField = (typeof MAPPING_FIELDS)[number];

export const DATE_FORMATS = ['AUTO', 'ISO', 'MDY', 'DMY'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const mappingSchema = z.object({
  format: z.enum(STRUCTURED_FILE_KINDS),
  recordPath: z.string().max(300).nullable(),
  fields: z.partialRecord(z.enum(MAPPING_FIELDS), z.string().min(1).max(300)),
  dateFormat: z.enum(DATE_FORMATS),
});
export type Mapping = z.infer<typeof mappingSchema>;

export const structuredSampleSchema = z.object({
  format: z.enum(STRUCTURED_FILE_KINDS),
  recordPath: z.string().max(300).nullable(),
  columns: z.array(z.string().max(300)).min(1).max(300),
  records: z.array(z.record(z.string(), z.string().max(1000))).max(IMPORT_SAMPLE_ROWS),
});
export type StructuredSample = z.infer<typeof structuredSampleSchema>;

export const structuredRecordsSchema = structuredSampleSchema.extend({
  records: z
    .array(z.record(z.string(), z.string().max(1000)))
    .min(1)
    .max(IMPORT_AI_MAX_RECORDS),
});
export type StructuredRecords = z.infer<typeof structuredRecordsSchema>;

export const isCompleteMapping = (fields: Mapping['fields']): boolean =>
  Boolean(fields.quantity && (fields.symbol || fields.occSymbol || fields.underlying));

export const IMPORT_AI_PATHS = {
  config: '/api/v1/import/ai/config',
  extract: '/api/v1/import/ai/extract',
  mapping: '/api/v1/import/ai/mapping',
  records: '/api/v1/import/ai/records',
} as const;

export const aiContextSchema = z.object({
  today: isoDate,
  locale: z.string().max(10),
  baseCurrency: currencyCode,
});
export type AiContext = z.infer<typeof aiContextSchema>;

export const aiExtractRequestSchema = z.object({
  context: aiContextSchema,
  file: importFileSchema,
});
export type AiExtractRequest = z.infer<typeof aiExtractRequestSchema>;

export const aiMappingRequestSchema = z.object({
  context: aiContextSchema,
  sample: structuredSampleSchema,
});
export type AiMappingRequest = z.infer<typeof aiMappingRequestSchema>;

export const aiRecordsRequestSchema = z.object({
  context: aiContextSchema,
  records: structuredRecordsSchema,
});
export type AiRecordsRequest = z.infer<typeof aiRecordsRequestSchema>;

export interface AiUsage {
  used: number;
  limit: number | null;
}

export interface AiProcessor {
  name: string;
  privacyUrl: string;
}

export interface AiServiceConfig {
  accepts: AiFileKind[];
  maxLongEdge: number;
  processor: AiProcessor;
  usage: AiUsage;
}

export const importDraftSchema = z.object({
  symbol: z.string().max(40).nullable(),
  expiration: z.string().max(20).nullable(),
  strike: z.string().max(40).nullable(),
  right: z.enum(OPTION_RIGHTS).nullable(),
  quantity: z.string().max(40).nullable(),
  price: z.string().max(40).nullable(),
  realizedPnl: z.string().max(40).nullable(),
  unrealizedPnl: z.string().max(40).nullable(),
  marketValue: z.string().max(40).nullable(),
  currency: z.string().max(10).nullable(),
});
export type ImportDraft = z.infer<typeof importDraftSchema>;

export const importSourceSchema = z.object({
  file: z.string().max(255),
  kind: z.enum(IMPORT_FILE_KINDS),
  record: z.number().int().positive().nullable(),
});
export type ImportSource = z.infer<typeof importSourceSchema>;

export const sourceRowSchema = z.object({
  id: z.string().min(1).max(100),
  draft: importDraftSchema,
  unread: z.boolean().default(false),
  description: z.string().max(1000),
  source: importSourceSchema,
  confidence: z.enum(['high', 'low']),
  note: z.string().max(500).nullable(),
});
export type SourceRow = z.infer<typeof sourceRowSchema>;

export const IMPORT_ISSUE_CODES = [
  'DUPLICATE_IMPORT',
  'LOW_CONFIDENCE',
  'INVALID',
  'ACCOUNT_NOT_EMPTY',
  'PRICE_REQUIRED',
  'PRICE_FROM_PNL',
  'RECORD_NOT_READ',
  'CLOSED_POSITION',
] as const;
export type ImportIssueCode = (typeof IMPORT_ISSUE_CODES)[number];

export interface ImportIssue {
  code: ImportIssueCode;
  message: string;
  params?: Record<string, string | number>;
}

export type ImportRowStatus = 'OK' | 'DUPLICATE' | 'REVIEW' | 'INVALID' | 'SKIPPED';

export interface ReviewRow extends SourceRow {
  status: ImportRowStatus;
  issues: ImportIssue[];
  checked: boolean;
  selectable: boolean;
  duplicate: boolean;
}

export const extractRequestSchema = z.object({
  file: importFileSchema,
  mapping: mappingSchema.optional(),
  saveMapping: z.boolean().default(false),
  readWithAi: z.boolean().default(false),
  locale: z.string().max(10).default('en'),
});
export type ExtractRequest = z.infer<typeof extractRequestSchema>;

export type ExtractFileStatus = 'READ' | 'NEEDS_MAPPING';

export interface ImportTotals {
  realizedPnl: string | null;
  unrealizedPnl: string | null;
  readRealizedPnl: string;
  readUnrealizedPnl: string;
}

export interface ExtractResponse {
  file: string;
  kind: ImportFileKind;
  status: ExtractFileStatus;
  documentType: ExtractDocumentType | null;
  mapping?: Mapping;
  mappingSource?: 'builtin' | 'saved' | 'ai' | 'guess';
  sample?: StructuredSample;
  recordCount?: number;
  totals?: ImportTotals;
  rows: SourceRow[];
  warnings: string[];
}

export const reviewRequestSchema = z
  .object({
    accountId: uuid.optional(),
    currency: currencyCode.optional(),
    rows: z.array(sourceRowSchema).max(IMPORT_MAX_ROWS),
    openingDate: isoDate.optional(),
  })
  .refine((r) => r.accountId != null || r.currency != null, {
    message: 'Give the account, or the currency of a new one',
  });
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

export interface ReviewResponse {
  accountEmpty: boolean;
  openingDate: string;
  rows: ReviewRow[];
}

export const commitRequestSchema = z.object({
  accountId: uuid,
  importId: uuid,
  openingDate: isoDate,
  rows: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        draft: importDraftSchema,
        allowDuplicate: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(IMPORT_MAX_ROWS),
});
export type CommitRequest = z.infer<typeof commitRequestSchema>;

export interface CommitResult {
  imported: number;
  symbols: string[];
}

export interface ImportConfig {
  structured: true;
  ai:
    | { status: 'unavailable' }
    | { status: 'sign-in'; providers: string[]; noAccount?: string }
    | ({ status: 'ready'; account?: string } & AiServiceConfig);
}

export const aiSignInSchema = z.object({ provider: z.enum(SIGN_IN_PROVIDERS) });
