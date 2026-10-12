import { dec } from '@tickrs/core';
import {
  createTransactionSchema,
  type CreateTransactionInput,
  type ImportDraft,
  type ImportIssue,
  type ReviewResponse,
  type ReviewRow,
  type SourceRow,
} from '@tickrs/shared';
import { averageFromPnl } from './rows.js';

export type Converted =
  | {
      ok: true;
      input: CreateTransactionInput;
      close?: CreateTransactionInput;
    }
  | { ok: false; message: string; code?: 'PRICE_REQUIRED' };

export const inputsOf = (c: Extract<Converted, { ok: true }>): CreateTransactionInput[] =>
  c.close ? [c.input, c.close] : [c.input];

const isZero = (value: string): boolean => {
  try {
    return dec(value).isZero();
  } catch {
    return false;
  }
};

export const isOptionDraft = (d: ImportDraft) => Boolean(d.expiration || d.strike || d.right);

export function draftToInput(draft: ImportDraft, accountId: string, openingDate: string): Converted {
  if (!draft.symbol) return { ok: false, message: 'No ticker' };
  let quantity;
  try {
    quantity = draft.quantity ? dec(draft.quantity) : null;
  } catch {
    quantity = null;
  }
  if (!quantity || quantity.isZero()) {
    return draft.realizedPnl && !isZero(draft.realizedPnl) && !isOptionDraft(draft)
      ? closedToInputs(draft, accountId, openingDate)
      : { ok: false, message: 'No quantity' };
  }
  const short = quantity.isNegative();
  const base = {
    accountId,
    tradeDate: openingDate,
    fee: '0',
    ...(draft.realizedPnl && !isZero(draft.realizedPnl) ? { realizedBefore: draft.realizedPnl } : {}),
  };

  let input: Record<string, unknown>;
  if (isOptionDraft(draft)) {
    if (!draft.expiration || !draft.strike || !draft.right) {
      return { ok: false, message: 'An option needs its expiration, strike and call or put' };
    }
    if (!quantity.isInteger()) return { ok: false, message: 'An option needs a whole number of contracts' };
    if (draft.expiration < openingDate) {
      return { ok: false, message: `This contract expired on ${draft.expiration}, before the opening date` };
    }
    if (draft.price == null)
      return { ok: false, message: 'Enter the average price per share', code: 'PRICE_REQUIRED' };
    input = {
      ...base,
      assetClass: 'OPTION',
      type: short ? 'STO' : 'BTO',
      contract: {
        underlying: draft.symbol,
        expiration: draft.expiration,
        strike: draft.strike,
        right: draft.right,
      },
      quantity: quantity.abs().toFixed(0),
      price: draft.price,
    };
  } else {
    if (draft.price == null) return { ok: false, message: 'Enter the average price', code: 'PRICE_REQUIRED' };
    input = {
      ...base,
      assetClass: 'STOCK',
      type: short ? 'SELL_SHORT' : 'BUY',
      symbol: draft.symbol,
      quantity: quantity.abs().toFixed(),
      price: draft.price,
    };
  }

  const parsed = parseInput(input);
  return 'message' in parsed ? { ok: false, message: parsed.message } : { ok: true, input: parsed.input };
}

function parseInput(input: Record<string, unknown>): { input: CreateTransactionInput } | { message: string } {
  const parsed = createTransactionSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    const field = issue.path.join('.');
    return { message: field ? `${field}: ${issue.message}` : issue.message };
  }
  return { input: parsed.data };
}

function closedToInputs(draft: ImportDraft, accountId: string, openingDate: string): Converted {
  const trade = {
    accountId,
    tradeDate: openingDate,
    fee: '0',
    assetClass: 'STOCK',
    symbol: draft.symbol,
    quantity: '1',
    price: '0',
  };
  const buy = parseInput({ ...trade, type: 'BUY', realizedBefore: draft.realizedPnl });
  if ('message' in buy) return { ok: false, message: buy.message };
  const sell = parseInput({ ...trade, type: 'SELL' });
  if ('message' in sell) return { ok: false, message: sell.message };
  return { ok: true, input: buy.input, close: sell.input };
}

const num = (value: string): string => {
  try {
    return dec(value).toFixed();
  } catch {
    return value;
  }
};

export function inputKey(input: CreateTransactionInput): string {
  if ('contract' in input) {
    const c = input.contract;
    return `${c.underlying}|${c.expiration}|${num(c.strike)}|${c.right}`;
  }
  return 'symbol' in input ? input.symbol : '?';
}

export interface ReviewContext {
  accountId: string;
  accountCurrency: string;
  accountEmpty: boolean;
  today: string;
  openingDate?: string;
}

const KIND_RANK: Record<string, number> = { csv: 0, json: 0, xml: 0, image: 1 };

export function review(rows: readonly SourceRow[], ctx: ReviewContext): ReviewResponse {
  const openingDate = ctx.openingDate ?? ctx.today;
  const issues = new Map<string, ImportIssue[]>(rows.map((r) => [r.id, []]));
  const add = (id: string, issue: ImportIssue) => issues.get(id)!.push(issue);

  const drafts = new Map<string, ImportDraft>();
  for (const row of rows) {
    const draft = { ...row.draft };
    if (draft.price == null) {
      const derived = averageFromPnl(draft, isOptionDraft(draft));
      if (derived) {
        draft.price = derived;
        add(row.id, {
          code: 'PRICE_FROM_PNL',
          message: `Average price ${derived}, worked out from the market value and unrealized P/L`,
          params: { price: derived },
        });
      }
    }
    drafts.set(row.id, draft);
  }
  const converted = new Map(
    rows.map((row) => [row.id, draftToInput(drafts.get(row.id)!, ctx.accountId, openingDate)]),
  );

  const seen = new Map<string, SourceRow>();
  const duplicateOf = new Map<string, SourceRow>();
  for (const row of rows.toSorted(
    (a, b) => (KIND_RANK[a.source.kind] ?? 2) - (KIND_RANK[b.source.kind] ?? 2),
  )) {
    const c = converted.get(row.id)!;
    if (!c.ok) continue;
    const key = inputKey(c.input);
    const first = seen.get(key);
    if (first) duplicateOf.set(row.id, first);
    else seen.set(key, row);
  }

  const result = rows.map((row): ReviewRow => {
    const draft = drafts.get(row.id)!;
    const c = converted.get(row.id)!;
    const own = issues.get(row.id)!;
    const out = (
      status: ReviewRow['status'],
      checked: boolean,
      selectable: boolean,
      duplicate = false,
    ): ReviewRow => ({ ...row, draft, status, issues: own, checked, selectable, duplicate });

    if (!ctx.accountEmpty) {
      add(row.id, {
        code: 'ACCOUNT_NOT_EMPTY',
        message: 'This account already has transactions, so holdings are not imported into it',
      });
      return out('SKIPPED', false, false);
    }
    if (row.unread && !c.ok) {
      add(row.id, {
        code: 'RECORD_NOT_READ',
        message: `Row ${row.source.record ?? '?'} of the file was not read: fill it in, or leave it out`,
        params: { record: row.source.record ?? 0 },
      });
      return out('INVALID', false, false);
    }
    if (!c.ok) {
      add(
        row.id,
        c.code ? { code: 'PRICE_REQUIRED', message: c.message } : { code: 'INVALID', message: c.message },
      );
      return out('INVALID', false, false);
    }
    if (c.input.assetClass === 'STOCK' && draft.currency && draft.currency !== ctx.accountCurrency) {
      add(row.id, {
        code: 'INVALID',
        message: `In ${draft.currency}; this account is in ${ctx.accountCurrency}`,
        params: { currency: draft.currency, accountCurrency: ctx.accountCurrency },
      });
      return out('INVALID', false, false);
    }
    if (c.close) {
      add(row.id, {
        code: 'CLOSED_POSITION',
        message: 'Closed: imported with its realized P/L only',
      });
    }
    const first = duplicateOf.get(row.id);
    if (first) {
      add(row.id, {
        code: 'DUPLICATE_IMPORT',
        message: `Also in ${first.source.file}`,
        params: { file: first.source.file },
      });
      return out('DUPLICATE', false, true, true);
    }
    if (row.confidence === 'low') {
      add(row.id, {
        code: 'LOW_CONFIDENCE',
        message: row.note ?? 'Check this row',
        params: row.note ? { note: row.note } : {},
      });
      return out('REVIEW', false, true);
    }
    return out('OK', true, true);
  });

  return { accountEmpty: ctx.accountEmpty, openingDate, rows: result };
}
