import type { DateFormat, ImportFileKind, Mapping, MappingField, SourceRow } from '@tickrs/shared';
import { guessFields } from './columns.js';
import { averageFromCost, instrumentDraft, positiveOf, sourceRow } from './rows.js';
import type { StructuredTable } from './structured.js';
import { detectDateFormat, parseDate, parseNumber, parseRight } from './values.js';

const TEMPLATE_COLUMNS = [
  'Symbol',
  'Quantity',
  'Average Price',
  'Realized P/L',
  'Currency',
  'Option Symbol',
  'Expiration',
  'Strike',
  'Call/Put',
  'Description',
] as const;

const TEMPLATE_KEYS = new Set(TEMPLATE_COLUMNS.map((c) => c.toLowerCase()));

export const isTemplate = (columns: readonly string[]): boolean => {
  const keys = columns.map((c) => c.trim().toLowerCase());
  return (
    keys.includes('quantity') &&
    (keys.includes('symbol') || keys.includes('option symbol')) &&
    keys.every((k) => TEMPLATE_KEYS.has(k))
  );
};

export function guessMapping(table: StructuredTable): Mapping {
  return {
    format: table.format,
    recordPath: table.recordPath,
    fields: guessFields(table.columns),
    dateFormat: 'AUTO',
  };
}

export function applyMapping(
  table: StructuredTable,
  mapping: Mapping,
  file: string,
  kind: ImportFileKind,
): SourceRow[] {
  const { fields } = mapping;
  const cellOf = (record: Record<string, string>, field: MappingField): string | null => {
    const column = fields[field];
    const value = column ? record[column] : undefined;
    return value == null || value.trim() === '' ? null : value.trim();
  };
  const dateFormat: Exclude<DateFormat, 'AUTO'> =
    mapping.dateFormat === 'AUTO'
      ? detectDateFormat(fields.expiration ? table.records.map((r) => r[fields.expiration!]) : []).format
      : mapping.dateFormat;

  return table.records.flatMap((record, index) => {
    const quantity = parseNumber(cellOf(record, 'quantity'));
    if (quantity == null || /^-?0*\.?0*$/.test(quantity)) return [];
    const symbolRaw = cellOf(record, 'symbol');
    const { isOption, ...instrument } = instrumentDraft({
      symbol: symbolRaw,
      occSymbol: cellOf(record, 'occSymbol'),
      underlying: cellOf(record, 'underlying'),
      expiration: cellOf(record, 'expiration') ? parseDate(cellOf(record, 'expiration'), dateFormat) : null,
      strike: cellOf(record, 'strike'),
      right: parseRight(cellOf(record, 'right')),
    });
    const price =
      positiveOf(cellOf(record, 'averagePrice')) ??
      averageFromCost(parseNumber(cellOf(record, 'costBasis')), quantity, isOption);
    return [
      sourceRow(
        `${file}#${index + 1}`,
        { file, kind, record: index + 1 },
        {
          description: cellOf(record, 'description') ?? [symbolRaw, cellOf(record, 'quantity')].join(' '),
          draft: {
            ...instrument,
            quantity,
            price,
            realizedPnl: parseNumber(cellOf(record, 'realizedPnl')),
            unrealizedPnl: parseNumber(cellOf(record, 'unrealizedPnl')),
            marketValue: parseNumber(cellOf(record, 'marketValue')),
            currency: cellOf(record, 'currency')?.toUpperCase() ?? null,
          },
        },
      ),
    ];
  });
}
