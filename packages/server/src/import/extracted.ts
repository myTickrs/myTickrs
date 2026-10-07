import { dec } from '@tickrs/core';
import type { ExtractResult, ImportFileKind, ImportTotals, SourceRow } from '@tickrs/shared';
import { instrumentDraft, positiveOf, sourceRow } from './rows.js';
import { parseNumber } from './values.js';

export function extractedRows(result: ExtractResult, file: string, kind: ImportFileKind): SourceRow[] {
  const currency = result.currency?.trim().toUpperCase() || null;
  return result.positions.map((position, index) => {
    const { isOption: _isOption, ...instrument } = instrumentDraft(position.instrument);
    return sourceRow(
      `${file}#p${index + 1}`,
      { file, kind, record: position.record },
      {
        description: [instrument.symbol, position.quantity, position.averagePrice].filter(Boolean).join(' '),
        confidence: position.confidence,
        note: position.note,
        draft: {
          ...instrument,
          quantity: parseNumber(position.quantity),
          price: positiveOf(position.averagePrice),
          realizedPnl: parseNumber(position.realizedPnl),
          unrealizedPnl: parseNumber(position.unrealizedPnl),
          marketValue: parseNumber(position.marketValue),
          currency,
        },
      },
    );
  });
}

export function extractedTotals(result: ExtractResult, rows: readonly SourceRow[]): ImportTotals | undefined {
  const realizedPnl = parseNumber(result.totals.realizedPnl);
  const unrealizedPnl = parseNumber(result.totals.unrealizedPnl);
  if (realizedPnl == null && unrealizedPnl == null) return undefined;
  const sum = (pick: (row: SourceRow) => string | null) =>
    rows.reduce((total, row) => total.plus(dec(pick(row) ?? '0')), dec('0')).toFixed();
  return {
    realizedPnl,
    unrealizedPnl,
    readRealizedPnl: sum((r) => r.draft.realizedPnl),
    readUnrealizedPnl: sum((r) => r.draft.unrealizedPnl),
  };
}

export function unreadRecords(
  records: readonly Record<string, string>[],
  rows: readonly SourceRow[],
  skipped: readonly number[],
  file: string,
  kind: ImportFileKind,
): SourceRow[] {
  const read = new Set([...rows.map((r) => r.source.record), ...skipped]);
  return records.flatMap((record, index) => {
    const number = index + 1;
    if (read.has(number)) return [];
    const values = Object.values(record)
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length === 0) return [];
    return [
      sourceRow(
        `${file}#r${number}`,
        { file, kind, record: number },
        {
          unread: true,
          description: values.join(' · '),
          confidence: 'low',
          note: 'The AI returned nothing for this row of the file',
        },
      ),
    ];
  });
}
