import {
  IMPORT_AI_MAX_RECORDS,
  IMPORT_MAX_IMAGE_BYTES,
  IMPORT_MAX_STRUCTURED_BYTES,
  extractResultSchema,
  importFileKind,
  isCompleteMapping,
  mappingSchema,
  optionIndex,
  type AiContext,
  type CommitRequest,
  type CommitResult,
  type ExtractRequest,
  type ExtractResponse,
  type ImportConfig,
  type Mapping,
  type ReviewRequest,
  type ReviewResponse,
  type SourceRow,
} from '@tickrs/shared';
import type { Ctx } from '../context.js';
import { AppError } from '../errors.js';
import type { Uuid } from '../model.js';
import type { ImportAi } from '../import/ai.js';
import { extractedRows, extractedTotals, unreadRecords } from '../import/extracted.js';
import { applyMapping, guessMapping, isTemplate } from '../import/mappings.js';
import { isOfx, readOfx } from '../import/ofx.js';
import { draftToInput, inputKey, inputsOf, review } from '../import/review.js';
import {
  decodeText,
  fingerprintOf,
  readCsv,
  readJson,
  readXml,
  recordsOf,
  sampleOf,
  type StructuredTable,
} from '../import/structured.js';
import { requireFeature } from '../identity.js';
import { loadRegistry } from './markets.js';
import { checkTransactions, createTransactions } from './transactions.js';

export async function importConfig(ctx: Ctx, ai: ImportAi | undefined): Promise<ImportConfig> {
  if (!ai || !ctx.principal.entitlements.has('ai-import'))
    return { structured: true, ai: { status: 'unavailable' } };
  return { structured: true, ai: await ai.config(ctx) };
}

const requireAi = (ctx: Ctx, ai: ImportAi | undefined): ImportAi => {
  requireFeature(ctx, 'ai-import');
  if (!ai) throw new AppError('IMPORT_UNAVAILABLE', 503, 'Reading screenshots is not available here');
  return ai;
};

function parseSaved(json: string | undefined): Mapping | null {
  if (!json) return null;
  try {
    const mapping = mappingSchema.safeParse(JSON.parse(json));
    return mapping.success ? mapping.data : null;
  } catch {
    return null;
  }
}

export async function extractFile(
  ctx: Ctx,
  ai: ImportAi | undefined,
  request: ExtractRequest,
): Promise<ExtractResponse> {
  const { baseCurrency } = await ctx.data.users.require();
  const response = await readFile(ctx, ai, request, baseCurrency);
  return { ...response, rows: await withListingCurrency(ctx, response.rows, baseCurrency) };
}

async function withListingCurrency(ctx: Ctx, rows: SourceRow[], baseCurrency: string): Promise<SourceRow[]> {
  const registry = await loadRegistry(ctx.data);
  const listed = new Map<string, string | null>();
  const listingOf = async (symbol: string) => {
    if (!listed.has(symbol)) {
      const known = await ctx.data.securities.find(symbol);
      listed.set(
        symbol,
        known?.currency ??
          (registry.split(symbol).suffix || optionIndex(symbol) ? registry.currencyOf(symbol) : null),
      );
    }
    return listed.get(symbol)!;
  };
  const out: SourceRow[] = [];
  for (const row of rows) {
    const { symbol } = row.draft;
    const currency = symbol ? await listingOf(symbol.toUpperCase()) : null;
    out.push({ ...row, draft: { ...row.draft, currency: currency ?? (row.draft.currency || baseCurrency) } });
  }
  return out;
}

async function readFile(
  ctx: Ctx,
  ai: ImportAi | undefined,
  request: ExtractRequest,
  baseCurrency: string,
): Promise<ExtractResponse> {
  const { file } = request;
  const kind = importFileKind(file.name, file.mediaType);
  if (!kind) {
    throw new AppError(
      'IMPORT_UNSUPPORTED',
      415,
      `${file.name}: only screenshots, CSV, JSON and XML can be imported`,
    );
  }
  const bytes = Buffer.from(file.data, 'base64');
  const limit = kind === 'image' ? IMPORT_MAX_IMAGE_BYTES : IMPORT_MAX_STRUCTURED_BYTES;
  if (bytes.byteLength === 0) throw new AppError('IMPORT_UNREADABLE', 422, `${file.name} is empty`);
  if (bytes.byteLength > limit) {
    throw new AppError('IMPORT_TOO_LARGE', 413, `${file.name} is larger than ${limit / 1_000_000} MB`, {
      limit,
    });
  }
  const context: AiContext = {
    today: ctx.clock.today(),
    locale: request.locale,
    baseCurrency,
  };

  if (kind === 'image') {
    const service = requireAi(ctx, ai);
    const result = extractResultSchema.parse(
      await service.extract(
        ctx,
        { name: file.name, kind, mediaType: file.mediaType, data: file.data },
        context,
      ),
    );
    const rows = extractedRows(result, file.name, kind);
    const totals = extractedTotals(result, rows);
    return {
      file: file.name,
      kind,
      status: 'READ',
      documentType: result.documentType,
      ...(totals ? { totals } : {}),
      rows,
      warnings: result.warnings,
    };
  }

  const text = decodeText(bytes);
  if (kind === 'xml' && isOfx(text)) {
    const { rows } = readOfx(text, file.name);
    return {
      file: file.name,
      kind,
      status: 'READ',
      documentType: 'positions',
      mappingSource: 'builtin',
      rows,
      warnings: [],
    };
  }

  const recordPath = request.mapping?.recordPath ?? null;
  const table: StructuredTable =
    kind === 'csv' ? readCsv(text) : kind === 'json' ? readJson(text, recordPath) : readXml(text, recordPath);
  const fingerprint = fingerprintOf(table);
  const read = (mapping: Mapping, source: ExtractResponse['mappingSource']): ExtractResponse => ({
    file: file.name,
    kind,
    status: 'READ',
    documentType: 'positions',
    mapping,
    mappingSource: source,
    rows: applyMapping(table, mapping, file.name, kind),
    warnings: [],
  });

  if (request.readWithAi) {
    const service = requireAi(ctx, ai);
    if (table.records.length > IMPORT_AI_MAX_RECORDS) {
      throw new AppError(
        'IMPORT_TOO_LARGE',
        413,
        `${file.name} has ${table.records.length} rows; the AI reads up to ${IMPORT_AI_MAX_RECORDS}. Split it and import the parts.`,
        { limit: IMPORT_AI_MAX_RECORDS },
      );
    }
    const result = extractResultSchema.parse(await service.readRecords(ctx, recordsOf(table), context));
    const rows = extractedRows(result, file.name, kind);
    return {
      file: file.name,
      kind,
      status: 'READ',
      documentType: result.documentType,
      rows: [...rows, ...unreadRecords(table.records, rows, result.skippedRecords, file.name, kind)],
      warnings: result.warnings,
    };
  }

  if (request.mapping) {
    const mapping = { ...request.mapping, format: table.format, recordPath: table.recordPath };
    if (request.saveMapping) {
      await ctx.data.importMappings.save(fingerprint, table.format, JSON.stringify(mapping));
    }
    return read(mapping, 'saved');
  }
  if (isTemplate(table.columns)) return read(guessMapping(table), 'builtin');

  const saved = parseSaved(await ctx.data.importMappings.find(fingerprint));
  if (saved) return read(saved, 'saved');

  let mapping = guessMapping(table);
  let source: ExtractResponse['mappingSource'] = 'guess';
  const config =
    ai && ctx.principal.entitlements.has('ai-import') ? await ai.config(ctx).catch(() => null) : null;
  if (
    !isCompleteMapping(mapping.fields) &&
    config?.status === 'ready' &&
    (config.usage.limit == null || config.usage.used < config.usage.limit)
  ) {
    const proposed = mappingSchema.safeParse(await ai!.proposeMapping(ctx, sampleOf(table), context));
    if (proposed.success) {
      mapping = { ...proposed.data, format: table.format, recordPath: table.recordPath };
      source = 'ai';
    }
  }
  return {
    file: file.name,
    kind,
    status: 'NEEDS_MAPPING',
    documentType: null,
    mapping,
    mappingSource: source,
    sample: sampleOf(table),
    recordCount: table.records.length,
    rows: [],
    warnings: [],
  };
}

async function isEmpty(ctx: Ctx, accountId: Uuid): Promise<boolean> {
  return (await ctx.data.transactions.listForAccount(accountId)).length === 0;
}

const NEW_ACCOUNT_ID = '00000000-0000-4000-8000-000000000000';

export async function reviewRows(ctx: Ctx, request: ReviewRequest): Promise<ReviewResponse> {
  const account = request.accountId ? await ctx.data.accounts.require(request.accountId as Uuid) : null;
  return review(request.rows, {
    accountId: account?.id ?? NEW_ACCOUNT_ID,
    accountCurrency: account?.currency ?? request.currency!,
    accountEmpty: account ? await isEmpty(ctx, account.id) : true,
    today: ctx.clock.today(),
    openingDate: request.openingDate,
  });
}

async function prepare(ctx: Ctx, request: Omit<CommitRequest, 'importId'>) {
  const account = await ctx.data.accounts.require(request.accountId as Uuid);
  if (!(await isEmpty(ctx, account.id))) {
    throw new AppError(
      'ACCOUNT_NOT_EMPTY',
      409,
      'This account already has transactions, so holdings are not imported into it',
    );
  }
  const ordered = request.rows.map((row) => {
    const converted = draftToInput(row.draft, account.id, request.openingDate);
    if (!converted.ok) {
      throw new AppError('VALIDATION_FAILED', 422, converted.message, { rowId: row.id });
    }
    return {
      id: row.id,
      inputs: inputsOf(converted),
      key: inputKey(converted.input),
      allow: row.allowDuplicate,
    };
  });
  const confirmedKeys = new Set(ordered.filter((r) => r.allow).map((r) => r.key));
  const count = new Map<string, number>();
  for (const r of ordered) count.set(r.key, (count.get(r.key) ?? 0) + 1);
  const unconfirmed = ordered
    .filter((r) => count.get(r.key)! > 1 && !confirmedKeys.has(r.key))
    .map((r) => r.id);
  if (unconfirmed.length > 0) {
    throw new AppError('IMPORT_DUPLICATE', 409, 'Some holdings are in the import twice; confirm them first', {
      rowIds: unconfirmed,
    });
  }
  const inputs = ordered.flatMap((r) => r.inputs);
  const rowIds = ordered.flatMap((r) => r.inputs.map(() => r.id));
  return { account, holdings: ordered.length, inputs, rowIds };
}

function withRowId(error: AppError, rowIds: string[]): AppError {
  const index = (error.details as { index?: number } | undefined)?.index;
  const rowId = index == null ? undefined : rowIds[index];
  return new AppError(error.code, error.status, error.message, {
    ...(error.details as object | undefined),
    rowId,
  });
}

export async function checkImport(ctx: Ctx, request: Omit<CommitRequest, 'importId'>) {
  const { account, holdings, inputs, rowIds } = await prepare(ctx, request);
  const failure = await checkTransactions(ctx, account.id, inputs);
  if (failure) throw withRowId(failure, rowIds);
  return { ok: true as const, rows: holdings };
}

const committed = new Map<string, { at: number; result: Promise<CommitResult> }>();
const COMMIT_TTL_MS = 60 * 60_000;

export function commitImport(ctx: Ctx, request: CommitRequest): Promise<CommitResult> {
  const now = Date.now();
  for (const [key, entry] of committed) if (now - entry.at > COMMIT_TTL_MS) committed.delete(key);
  const key = `${ctx.principal.userId}:${request.importId}`;
  const running = committed.get(key);
  if (running) return running.result;

  const result = commit(ctx, request);
  committed.set(key, { at: now, result });
  result.catch(() => committed.delete(key));
  return result;
}

async function commit(ctx: Ctx, request: CommitRequest): Promise<CommitResult> {
  const { account, holdings, inputs, rowIds } = await prepare(ctx, request);
  try {
    const batch = await createTransactions(ctx, account.id, inputs);
    return { imported: holdings, symbols: batch.symbols };
  } catch (error) {
    if (error instanceof AppError) throw withRowId(error, rowIds);
    throw error;
  }
}
