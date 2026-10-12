import type { HoldingsResponse } from '../../lib/queries.js';

type StockRow = HoldingsResponse['stocks'][number];
type OptionRow = HoldingsResponse['options'][number];
type ClosedRow = HoldingsResponse['closedStocks'][number];

export type HoldingRow =
  | { kind: 'stock'; stock: StockRow }
  | { kind: 'option'; option: OptionRow }
  | { kind: 'closed'; closed: ClosedRow };

export const holdingKey = (r: HoldingRow) =>
  r.kind === 'stock'
    ? r.stock.symbol
    : r.kind === 'option'
      ? r.option.contractId
      : `closed:${r.closed.symbol}`;
export const holdingHref = (r: HoldingRow) =>
  r.kind === 'stock'
    ? `/stocks/${r.stock.symbol}`
    : r.kind === 'closed'
      ? `/stocks/${r.closed.symbol}`
      : '/options';

export type SortKey = 'symbol' | 'dayChange' | 'totalPl' | 'value' | 'unrealized' | 'weight';
export type HoldingSort = { key: SortKey; direction: 'asc' | 'desc' };
export const SORT_KEYS: readonly string[] = [
  'symbol',
  'dayChange',
  'totalPl',
  'value',
  'unrealized',
  'weight',
] satisfies SortKey[];

export function nextSort(current: HoldingSort | undefined, key: SortKey): HoldingSort {
  if (current?.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  return { key, direction: key === 'symbol' ? 'asc' : 'desc' };
}

function baseAmount(r: HoldingRow, key: Exclude<SortKey, 'symbol'>): number {
  if (r.kind === 'closed') return 0;
  if (key === 'weight') return Number(r.kind === 'stock' ? r.stock.weight : r.option.weight);
  if (r.kind === 'stock') {
    if (key === 'value') return Number(r.stock.marketValueBase);
    const amount =
      key === 'dayChange'
        ? r.stock.dayChange.amount
        : key === 'totalPl'
          ? r.stock.totalPl.amount
          : r.stock.unrealized;
    return Number(amount) * Number(r.stock.fxRate);
  }
  if (key === 'value') return Number(r.option.marketValueBase);
  const value = Number(r.option.marketValue);
  const rate = value === 0 ? 1 : Number(r.option.marketValueBase) / value;
  const amount =
    key === 'dayChange'
      ? r.option.dayChange.amount
      : key === 'totalPl'
        ? r.option.totalPl.amount
        : r.option.unrealized;
  return Number(amount) * rate;
}

export function holdingRows(data: HoldingsResponse | undefined, sort?: HoldingSort): HoldingRow[] {
  if (!data) return [];
  return [...openHoldingRows(data, sort), ...closedHoldingRows(data, sort)];
}

function closedHoldingRows(data: HoldingsResponse, sort?: HoldingSort): HoldingRow[] {
  const sign = sort?.key === 'symbol' && sort.direction === 'desc' ? -1 : 1;
  return data.closedStocks
    .toSorted((a, b) => sign * a.symbol.localeCompare(b.symbol))
    .map((closed) => ({ kind: 'closed', closed }));
}

function openHoldingRows(data: HoldingsResponse, sort?: HoldingSort): HoldingRow[] {
  const groups = new Map<string, HoldingRow[]>();
  for (const stock of data.stocks) groups.set(stock.symbol, [{ kind: 'stock', stock }]);
  const unheld = new Map<string, HoldingRow[]>();
  for (const option of data.options) {
    const group = groups.get(option.underlying) ?? unheld.get(option.underlying) ?? [];
    if (group.length === 0) unheld.set(option.underlying, group);
    group.push({ kind: 'option', option });
  }
  const entries = [...groups, ...unheld];
  if (!sort) return entries.flatMap(([, rows]) => rows);

  const sign = sort.direction === 'asc' ? 1 : -1;
  if (sort.key === 'symbol') {
    return entries.toSorted(([a], [b]) => sign * a.localeCompare(b)).flatMap(([, rows]) => rows);
  }
  const key = sort.key;
  const byAmount = (a: HoldingRow, b: HoldingRow) => sign * (baseAmount(a, key) - baseAmount(b, key));
  const groupAmount = (rows: HoldingRow[]) =>
    rows[0]!.kind === 'stock'
      ? baseAmount(rows[0]!, key)
      : rows.reduce((sum, r) => sum + baseAmount(r, key), 0);
  return entries
    .map(([, rows]) =>
      rows[0]!.kind === 'stock' ? [rows[0]!, ...rows.slice(1).toSorted(byAmount)] : rows.toSorted(byAmount),
    )
    .toSorted((a, b) => sign * (groupAmount(a) - groupAmount(b)))
    .flat();
}
